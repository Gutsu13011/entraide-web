import { TestBed } from '@angular/core/testing';
import { ServiceProviderDetail } from './service-provider-detail';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { finalize, of, Subject, throwError } from 'rxjs';
import { ServiceProviderStore } from '../../services/service-provider-store';
import type { ServiceProvider } from '../../../models/service-provider.model';
import { ReviewStore } from '../../../reviews/services/review-store';
import type { Review } from '../../../models/review.model';
import type { ReviewSummary } from '../../../models/review-summary.model';
import { ServiceOfferingStore } from '../../../service-offerings/services/service-offering-store';
import { ServiceOffering, ServicePricingType } from '../../../models/service-offering.model';
import { CurrentUserResponse } from '../../../models/auth.model';
import { signal } from '@angular/core';
import { AuthSession } from '../../../auth/services/auth-session';

describe('ServiceProviderDetail', () => {
  const mockServiceProvider: ServiceProvider = {
    id: 7,
    firstName: 'John',
    lastName: 'Doe',
    profession: 'Plombier',
    city: 'Paris',
    description: "Plombier expérimenté avec 5 ans d'expérience.",
    hourlyRate: 25,
    imageUrl: '',
    available: true,
    ownerUserId: 42,
  };
  const currentUserMock: CurrentUserResponse = {
    id: 42,
    firstName: 'John',
    lastName: 'Doe',
    email: 'johndoe@mail.com',
  };
  const serviceProvidersStoreStub = {
    getById: () => of(mockServiceProvider),
    remove: vi.fn(),
  };
  const mockReviews: Review[] = [
    {
      id: 1,
      authorName: 'Alice Martin',
      rating: 5,
      comment: 'Excellent service.',
      createdAt: '2026-09-19T10:00:00.000Z',
      serviceProviderId: 7,
    },
  ];
  const mockReviewSummary: ReviewSummary = {
    reviewCount: 1,
    averageRating: 5,
  };
  const mockServiceOfferings: ServiceOffering[] = [
    {
      id: 1,
      title: 'title1',
      description: 'description1',
      pricingType: ServicePricingType.FREE,
      hourlyRate: null,
      serviceProviderId: 7,
    },
    {
      id: 2,
      title: 'title2',
      description: 'description2',
      pricingType: ServicePricingType.HOURLY,
      hourlyRate: 20,
      serviceProviderId: 7,
    },
  ];
  const reviewStoreStub = {
    getAll: vi.fn(),
    getSummary: vi.fn(),
  };
  const serviceOfferingsStoreStub = {
    getAll: vi.fn(),
    delete: vi.fn(),
  };
  const authSessionStub = {
    currentUser: signal<CurrentUserResponse | null>(null),
  };

  let component: ServiceProviderDetail;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    serviceProvidersStoreStub.remove.mockReset();
    serviceOfferingsStoreStub.delete.mockReset();
    reviewStoreStub.getAll.mockReset().mockReturnValue(of(mockReviews));
    reviewStoreStub.getSummary.mockReset().mockReturnValue(of(mockReviewSummary));
    serviceOfferingsStoreStub.getAll.mockReset().mockReturnValue(of(mockServiceOfferings));
    authSessionStub.currentUser.set(null);

    await TestBed.configureTestingModule({
      imports: [ServiceProviderDetail],
      providers: [
        provideRouter([
          { path: '', pathMatch: 'full', children: [] },
          {
            path: 'service-providers/:id',
            component: ServiceProviderDetail,
          },
        ]),
        {
          provide: ServiceProviderStore,
          useValue: serviceProvidersStoreStub,
        },
        {
          provide: ReviewStore,
          useValue: reviewStoreStub,
        },
        {
          provide: ServiceOfferingStore,
          useValue: serviceOfferingsStoreStub,
        },
        {
          provide: AuthSession,
          useValue: authSessionStub,
        },
      ],
    }).compileComponents();

    harness = await RouterTestingHarness.create();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const openDetail = async () => {
    component = await harness.navigateByUrl('/service-providers/7', ServiceProviderDetail);
  };

  it('should cancel all detail loads on departure and ignore their late responses', async () => {
    const providerResponse = new Subject<ServiceProvider>();
    const reviewsResponse = new Subject<Review[]>();
    const summaryResponse = new Subject<ReviewSummary>();
    const offeringsResponse = new Subject<ServiceOffering[]>();
    const finalized = {
      provider: vi.fn(),
      reviews: vi.fn(),
      summary: vi.fn(),
      offerings: vi.fn(),
    };
    vi.spyOn(serviceProvidersStoreStub, 'getById').mockReturnValue(
      providerResponse.pipe(finalize(finalized.provider)),
    );
    reviewStoreStub.getAll.mockReturnValue(reviewsResponse.pipe(finalize(finalized.reviews)));
    reviewStoreStub.getSummary.mockReturnValue(summaryResponse.pipe(finalize(finalized.summary)));
    serviceOfferingsStoreStub.getAll.mockReturnValue(
      offeringsResponse.pipe(finalize(finalized.offerings)),
    );
    await openDetail();

    for (const requestFinalized of Object.values(finalized)) {
      expect(requestFinalized).not.toHaveBeenCalled();
    }
    expect(component.isLoading()).toBe(true);
    expect(component.isReviewLoading()).toBe(true);
    expect(component.isServiceOfferingsLoading()).toBe(true);

    await harness.navigateByUrl('/');

    for (const requestFinalized of Object.values(finalized)) {
      expect(requestFinalized).toHaveBeenCalledTimes(1);
    }
    expect(component.isLoading()).toBe(false);
    expect(component.isReviewLoading()).toBe(false);
    expect(component.isServiceOfferingsLoading()).toBe(false);

    providerResponse.next(mockServiceProvider);
    providerResponse.complete();
    reviewsResponse.next(mockReviews);
    reviewsResponse.complete();
    summaryResponse.next(mockReviewSummary);
    summaryResponse.complete();
    offeringsResponse.next(mockServiceOfferings);
    offeringsResponse.complete();

    expect(component.serviceProvider()).toBeUndefined();
    expect(component.reviews()).toEqual([]);
    expect(component.reviewSummary()).toEqual({ reviewCount: 0, averageRating: null });
    expect(component.serviceOfferings()).toEqual([]);
  });

  it.each(['profile', 'offering'] as const)(
    'should cancel pending %s deletion on departure without applying its late response',
    async (target) => {
      authSessionStub.currentUser.set(currentUserMock);
      await openDetail();
      const originalOfferings = component.serviceOfferings();
      const response = new Subject<void>();
      const requestFinalized = vi.fn();
      const remove =
        target === 'profile' ? serviceProvidersStoreStub.remove : serviceOfferingsStoreStub.delete;
      remove.mockReturnValue(response.pipe(finalize(requestFinalized)));
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      if (target === 'profile') {
        component.onDelete();
        expect(component.isDeleting()).toBe(true);
      } else {
        component.onDeleteOffering(mockServiceOfferings[0]);
        expect(component.deletingOfferingId()).toBe(mockServiceOfferings[0].id);
      }
      expect(remove).toHaveBeenCalledTimes(1);
      expect(requestFinalized).not.toHaveBeenCalled();

      await harness.navigateByUrl('/');

      expect(requestFinalized).toHaveBeenCalledTimes(1);
      expect(component.isDeleting()).toBe(false);
      expect(component.deletingOfferingId()).toBeNull();

      response.next(undefined);
      response.complete();

      expect(navigateSpy).not.toHaveBeenCalled();
      expect(component.serviceOfferings()).toBe(originalOfferings);
      expect(component.serviceProvider()).toEqual(mockServiceProvider);
      expect(component.deleteError()).toBeNull();
      expect(component.deleteOfferingError()).toBeNull();
    },
  );

  describe('navigation between provider profiles', () => {
    const nextProvider: ServiceProvider = {
      ...mockServiceProvider,
      id: 8,
      firstName: 'Alice',
      lastName: 'Martin',
      ownerUserId: 99,
    };
    const nextReviews: Review[] = [
      { ...mockReviews[0], id: 8, serviceProviderId: 8, rating: 4, comment: 'Avis pour Alice.' },
    ];
    const nextSummary: ReviewSummary = { reviewCount: 1, averageRating: 4 };
    const nextOfferings: ServiceOffering[] = [
      { ...mockServiceOfferings[0], id: 8, serviceProviderId: 8, title: 'Offre pour Alice' },
    ];

    it('should reuse the component, clear the previous profile and display the new data and actions', async () => {
      authSessionStub.currentUser.set(currentUserMock);
      const getProvider = vi.spyOn(serviceProvidersStoreStub, 'getById');
      await openDetail();
      expect(component.isOwner()).toBe(true);
      const providerResponse = new Subject<ServiceProvider>();
      const reviewsResponse = new Subject<Review[]>();
      const summaryResponse = new Subject<ReviewSummary>();
      const offeringsResponse = new Subject<ServiceOffering[]>();
      getProvider.mockReturnValue(providerResponse);
      reviewStoreStub.getAll.mockReturnValue(reviewsResponse);
      reviewStoreStub.getSummary.mockReturnValue(summaryResponse);
      serviceOfferingsStoreStub.getAll.mockReturnValue(offeringsResponse);

      const reused = await harness.navigateByUrl('/service-providers/8', ServiceProviderDetail);

      expect(reused).toBe(component);
      expect(component.serviceProviderId).toBe(8);
      expect(getProvider).toHaveBeenLastCalledWith(8);
      expect(reviewStoreStub.getAll).toHaveBeenLastCalledWith(8);
      expect(reviewStoreStub.getSummary).toHaveBeenLastCalledWith(8);
      expect(serviceOfferingsStoreStub.getAll).toHaveBeenLastCalledWith(8);
      expect(component.serviceProvider()).toBeUndefined();
      expect(component.isOwner()).toBe(false);
      expect(component.reviews()).toEqual([]);
      expect(component.reviewSummary()).toEqual({ reviewCount: 0, averageRating: null });
      expect(component.serviceOfferings()).toEqual([]);
      expect(component.isLoading()).toBe(true);
      expect(component.isReviewLoading()).toBe(true);
      expect(component.isServiceOfferingsLoading()).toBe(true);
      expect(harness.routeNativeElement?.textContent).not.toContain('John Doe');
      expect(harness.routeNativeElement?.querySelector('.provider-actions')).toBeNull();

      providerResponse.next(nextProvider);
      providerResponse.complete();
      reviewsResponse.next(nextReviews);
      reviewsResponse.complete();
      summaryResponse.next(nextSummary);
      summaryResponse.complete();
      offeringsResponse.next(nextOfferings);
      offeringsResponse.complete();
      harness.detectChanges();

      expect(component.serviceProvider()).toEqual(nextProvider);
      expect(component.reviews()).toEqual(nextReviews);
      expect(component.reviewSummary()).toEqual(nextSummary);
      expect(component.serviceOfferings()).toEqual(nextOfferings);
      expect(component.isLoading()).toBe(false);
      expect(component.isReviewLoading()).toBe(false);
      expect(component.isServiceOfferingsLoading()).toBe(false);
      expect(harness.routeNativeElement?.textContent).toContain('Alice Martin');
      expect(harness.routeNativeElement?.textContent).toContain('Avis pour Alice.');
      expect(harness.routeNativeElement?.textContent).toContain('Offre pour Alice');
      expect(harness.routeNativeElement?.querySelector('.provider-actions')).toBeNull();
      expect(
        harness.routeNativeElement?.querySelector(
          'a[href="/service-providers/8/service-offerings/8/service-requests/new"]',
        ),
      ).toBeTruthy();
    });

    it('should cancel all previous loads and keep the new loads active until their responses arrive', async () => {
      const oldProvider = new Subject<ServiceProvider>();
      const oldReviews = new Subject<Review[]>();
      const oldSummary = new Subject<ReviewSummary>();
      const oldOfferings = new Subject<ServiceOffering[]>();
      const stopped = [vi.fn(), vi.fn(), vi.fn(), vi.fn()];
      const newProvider = new Subject<ServiceProvider>();
      const newReviews = new Subject<Review[]>();
      const newSummary = new Subject<ReviewSummary>();
      const newOfferings = new Subject<ServiceOffering[]>();
      vi.spyOn(serviceProvidersStoreStub, 'getById')
        .mockReturnValueOnce(oldProvider.pipe(finalize(stopped[0])))
        .mockReturnValueOnce(newProvider);
      reviewStoreStub.getAll
        .mockReturnValueOnce(oldReviews.pipe(finalize(stopped[1])))
        .mockReturnValueOnce(newReviews);
      reviewStoreStub.getSummary
        .mockReturnValueOnce(oldSummary.pipe(finalize(stopped[2])))
        .mockReturnValueOnce(newSummary);
      serviceOfferingsStoreStub.getAll
        .mockReturnValueOnce(oldOfferings.pipe(finalize(stopped[3])))
        .mockReturnValueOnce(newOfferings);
      await openDetail();
      for (const stop of stopped) expect(stop).not.toHaveBeenCalled();

      expect(await harness.navigateByUrl('/service-providers/8', ServiceProviderDetail)).toBe(
        component,
      );

      for (const stop of stopped) expect(stop).toHaveBeenCalledTimes(1);
      expect(component.isLoading()).toBe(true);
      expect(component.isReviewLoading()).toBe(true);
      expect(component.isServiceOfferingsLoading()).toBe(true);
      newProvider.next(nextProvider);
      newProvider.complete();
      newReviews.next(nextReviews);
      newReviews.complete();
      newSummary.next(nextSummary);
      newSummary.complete();
      newOfferings.next(nextOfferings);
      newOfferings.complete();

      oldProvider.next(mockServiceProvider);
      oldProvider.complete();
      oldReviews.next(mockReviews);
      oldReviews.complete();
      oldSummary.next(mockReviewSummary);
      oldSummary.complete();
      oldOfferings.next(mockServiceOfferings);
      oldOfferings.complete();
      harness.detectChanges();

      expect(component.serviceProvider()).toEqual(nextProvider);
      expect(component.reviews()).toEqual(nextReviews);
      expect(component.reviewSummary()).toEqual(nextSummary);
      expect(component.serviceOfferings()).toEqual(nextOfferings);
      expect(component.isLoading()).toBe(false);
      expect(component.isReviewLoading()).toBe(false);
      expect(component.isServiceOfferingsLoading()).toBe(false);
      expect(harness.routeNativeElement?.textContent).toContain('Offre pour Alice');
      expect(harness.routeNativeElement?.textContent).not.toContain('John Doe');
    });

    it('should recover all loaders and clear their errors when navigating after failed requests', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(serviceProvidersStoreStub, 'getById')
        .mockReturnValueOnce(throwError(() => new Error('Profile unavailable')))
        .mockReturnValueOnce(of(nextProvider));
      reviewStoreStub.getAll
        .mockReturnValueOnce(throwError(() => new Error('Reviews unavailable')))
        .mockReturnValueOnce(of(nextReviews));
      reviewStoreStub.getSummary
        .mockReturnValueOnce(of(mockReviewSummary))
        .mockReturnValueOnce(of(nextSummary));
      serviceOfferingsStoreStub.getAll
        .mockReturnValueOnce(throwError(() => new Error('Offerings unavailable')))
        .mockReturnValueOnce(of(nextOfferings));
      await openDetail();
      expect(component.errorMessage()).toBe('Impossible de charger cet intervenant.');
      expect(component.reviewsErrorMessage()).toBe('Impossible de charger les avis.');
      expect(component.serviceOfferingErrorMessage()).toBe('Impossible de charger les offres.');

      expect(await harness.navigateByUrl('/service-providers/8', ServiceProviderDetail)).toBe(
        component,
      );

      expect(component.errorMessage()).toBeNull();
      expect(component.reviewsErrorMessage()).toBeNull();
      expect(component.serviceOfferingErrorMessage()).toBeNull();
      expect(component.serviceProvider()).toEqual(nextProvider);
      expect(component.reviews()).toEqual(nextReviews);
      expect(component.reviewSummary()).toEqual(nextSummary);
      expect(component.serviceOfferings()).toEqual(nextOfferings);
      expect(harness.routeNativeElement?.querySelector('[role="alert"]')).toBeNull();
    });

    it('should clear previous deletion errors and target the current provider for subsequent actions', async () => {
      authSessionStub.currentUser.set(currentUserMock);
      vi.spyOn(serviceProvidersStoreStub, 'getById')
        .mockReturnValueOnce(of(mockServiceProvider))
        .mockReturnValueOnce(of({ ...nextProvider, ownerUserId: currentUserMock.id }));
      serviceOfferingsStoreStub.getAll
        .mockReturnValueOnce(of(mockServiceOfferings))
        .mockReturnValueOnce(of(nextOfferings));
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      serviceProvidersStoreStub.remove.mockReturnValue(
        throwError(() => new Error('Deletion failed')),
      );
      serviceOfferingsStoreStub.delete.mockReturnValue(
        throwError(() => new Error('Deletion failed')),
      );
      await openDetail();
      component.onDelete();
      component.onDeleteOffering(mockServiceOfferings[0]);
      expect(component.deleteError()).not.toBeNull();
      expect(component.deleteOfferingError()).not.toBeNull();

      expect(await harness.navigateByUrl('/service-providers/8', ServiceProviderDetail)).toBe(
        component,
      );

      expect(component.deleteError()).toBeNull();
      expect(component.deleteOfferingError()).toBeNull();
      component.onDeleteOffering(nextOfferings[0]);
      component.onDelete();
      expect(serviceOfferingsStoreStub.delete).toHaveBeenLastCalledWith(8, 8);
      expect(serviceProvidersStoreStub.remove).toHaveBeenLastCalledWith(8);
      expect(navigateSpy).not.toHaveBeenCalled();
    });

    it('should not reload the profile when route changes keep the same provider id', async () => {
      const getProvider = vi.spyOn(serviceProvidersStoreStub, 'getById');
      await openDetail();

      expect(
        await harness.navigateByUrl(
          '/service-providers/7;tab=reviews?source=menu',
          ServiceProviderDetail,
        ),
      ).toBe(component);

      expect(getProvider).toHaveBeenCalledTimes(1);
      expect(reviewStoreStub.getAll).toHaveBeenCalledTimes(1);
      expect(reviewStoreStub.getSummary).toHaveBeenCalledTimes(1);
      expect(serviceOfferingsStoreStub.getAll).toHaveBeenCalledTimes(1);
    });

    it.each([
      { target: 'profile', outcome: 'success' },
      { target: 'profile', outcome: 'error' },
      { target: 'offering', outcome: 'success' },
      { target: 'offering', outcome: 'error' },
    ] as const)(
      'should cancel the previous $target deletion and ignore its late $outcome on the next profile',
      async ({ target, outcome }) => {
        authSessionStub.currentUser.set(currentUserMock);
        vi.spyOn(serviceProvidersStoreStub, 'getById')
          .mockReturnValueOnce(of(mockServiceProvider))
          .mockReturnValueOnce(of({ ...nextProvider, ownerUserId: currentUserMock.id }));
        serviceOfferingsStoreStub.getAll
          .mockReturnValueOnce(of(mockServiceOfferings))
          .mockReturnValueOnce(of(nextOfferings));
        await openDetail();
        const response = new Subject<void>();
        const stopped = vi.fn();
        const remove =
          target === 'profile'
            ? serviceProvidersStoreStub.remove
            : serviceOfferingsStoreStub.delete;
        remove.mockReturnValue(response.pipe(finalize(stopped)));
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
        if (target === 'profile') {
          component.onDelete();
          expect(component.isDeleting()).toBe(true);
          expect(remove).toHaveBeenCalledWith(7);
        } else {
          component.onDeleteOffering(mockServiceOfferings[0]);
          expect(component.deletingOfferingId()).toBe(1);
          expect(remove).toHaveBeenCalledWith(7, 1);
        }
        expect(stopped).not.toHaveBeenCalled();

        expect(await harness.navigateByUrl('/service-providers/8', ServiceProviderDetail)).toBe(
          component,
        );

        expect(stopped).toHaveBeenCalledTimes(1);
        expect(component.isDeleting()).toBe(false);
        expect(component.deletingOfferingId()).toBeNull();
        if (outcome === 'success') {
          response.next(undefined);
          response.complete();
        } else {
          response.error(new Error('Old deletion failed'));
        }
        harness.detectChanges();

        expect(navigateSpy).not.toHaveBeenCalled();
        expect(TestBed.inject(Router).url).toBe('/service-providers/8');
        expect(component.serviceOfferings()).toBe(nextOfferings);
        expect(component.deleteError()).toBeNull();
        expect(component.deleteOfferingError()).toBeNull();
        const deleteButtons =
          harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('.danger-button');
        expect(deleteButtons.length).toBeGreaterThan(0);
        for (const button of deleteButtons) expect(button.disabled).toBe(false);
      },
    );
  });

  it('should show the add-offering link to the provider owner', async () => {
    authSessionStub.currentUser.set(currentUserMock);
    await openDetail();
    expect(component.isOwner()).toBe(true);
    expect(
      harness.routeNativeElement?.querySelector(
        'a[href="/service-providers/7/service-offerings/new"]',
      ),
    ).toBeTruthy();
  });

  it('should hide the add-offering link from another user', async () => {
    authSessionStub.currentUser.set({ ...currentUserMock, id: 7 });
    await openDetail();
    expect(component.isOwner()).toBe(false);
    expect(
      harness.routeNativeElement?.querySelector(
        'a[href="/service-providers/7/service-offerings/new"]',
      ),
    ).toBeNull();
  });

  it('should hide the add-offering link when no user is authenticated', async () => {
    await openDetail();
    expect(component.isOwner()).toBe(false);
    expect(
      harness.routeNativeElement?.querySelector(
        'a[href="/service-providers/7/service-offerings/new"]',
      ),
    ).toBeNull();
  });

  it('should hide the add-offering link when the provider has no owner', async () => {
    authSessionStub.currentUser.set(currentUserMock);
    await openDetail();
    component.serviceProvider.set({ ...mockServiceProvider, ownerUserId: null });
    harness.detectChanges();
    expect(component.isOwner()).toBe(false);
    expect(
      harness.routeNativeElement?.querySelector(
        'a[href="/service-providers/7/service-offerings/new"]',
      ),
    ).toBeNull();
  });

  it('should group profile editing and deletion for the provider owner', async () => {
    authSessionStub.currentUser.set(currentUserMock);
    await openDetail();

    const actions = harness.routeNativeElement!.querySelector(
      '.service-provider-card .provider-actions',
    );
    expect(actions).not.toBeNull();
    const controls = actions!.querySelectorAll('a, button');

    expect(controls).toHaveLength(2);
    expect(controls[0].getAttribute('href')).toBe('/service-providers/7/edit');
    expect(controls[0].textContent?.trim()).toBe('Modifier ma fiche');
    expect(controls[1].textContent?.trim()).toBe('Supprimer ma fiche');
    expect(controls[1].tagName).toBe('BUTTON');
  });

  it('should link each offering to its own edit page for the provider owner', async () => {
    authSessionStub.currentUser.set(currentUserMock);
    await openDetail();

    const cards = harness.routeNativeElement!.querySelectorAll('.service-offering');
    expect(cards).toHaveLength(mockServiceOfferings.length);

    mockServiceOfferings.forEach((offering, index) => {
      const link = cards[index].querySelector('a');
      expect(link?.textContent?.trim()).toBe('Modifier cette offre');
      expect(link?.getAttribute('href')).toBe(
        `/service-providers/7/service-offerings/${offering.id}/edit`,
      );
    });
  });

  it.each([
    { scenario: 'no user is authenticated', user: null, ownerUserId: 42 },
    {
      scenario: 'another user is authenticated',
      user: { ...currentUserMock, id: 99 },
      ownerUserId: 42,
    },
    { scenario: 'the provider has no owner', user: currentUserMock, ownerUserId: null },
  ])(
    'should hide profile actions and offering edit links when $scenario',
    async ({ user, ownerUserId }) => {
      authSessionStub.currentUser.set(user);
      await openDetail();
      component.serviceProvider.set({ ...mockServiceProvider, ownerUserId });
      harness.detectChanges();

      const element = harness.routeNativeElement!;
      expect(element.querySelector('.provider-actions')).toBeNull();
      expect(element.querySelector('a[href="/service-providers/7/edit"]')).toBeNull();
      expect(element.querySelectorAll('.service-offering a[href$="/edit"]')).toHaveLength(0);
      expect(element.querySelectorAll('.service-offering .danger-button')).toHaveLength(0);
      expect(element.querySelectorAll('.service-offering')).toHaveLength(2);
      expect(element.textContent).toContain('title1');
      expect(element.textContent).toContain('title2');
    },
  );

  describe('service request links', () => {
    it.each([
      { scenario: 'an anonymous visitor', user: null },
      { scenario: 'another authenticated account', user: { ...currentUserMock, id: 99 } },
    ])('should link each offering to its request form for $scenario', async ({ user }) => {
      authSessionStub.currentUser.set(user);
      await openDetail();
      harness.detectChanges();

      const cards = harness.routeNativeElement!.querySelectorAll('.service-offering');
      expect(cards).toHaveLength(mockServiceOfferings.length);
      mockServiceOfferings.forEach((offering, index) => {
        const link = cards[index].querySelector('.offering-actions a');
        expect(link?.textContent?.trim()).toBe('Demander cette prestation');
        expect(link?.getAttribute('href')).toBe(
          `/service-providers/7/service-offerings/${offering.id}/service-requests/new`,
        );
        expect(cards[index].querySelector('a[href$="/edit"]')).toBeNull();
        expect(cards[index].querySelector('.danger-button')).toBeNull();
      });
    });

    it('should keep management actions and hide request links for the provider owner', async () => {
      authSessionStub.currentUser.set(currentUserMock);
      await openDetail();
      harness.detectChanges();

      const element = harness.routeNativeElement!;
      expect(
        element.querySelectorAll('.service-offering a[href$="/service-requests/new"]'),
      ).toHaveLength(0);
      expect(element.querySelectorAll('.service-offering a[href$="/edit"]')).toHaveLength(2);
      expect(element.querySelectorAll('.service-offering .danger-button')).toHaveLength(2);
    });

    it('should hide request links for a provider profile without an owner', async () => {
      await openDetail();
      component.serviceProvider.set({ ...mockServiceProvider, ownerUserId: null });
      harness.detectChanges();

      const element = harness.routeNativeElement!;
      expect(
        element.querySelectorAll('.service-offering a[href$="/service-requests/new"]'),
      ).toHaveLength(0);
      expect(element.querySelectorAll('.service-offering')).toHaveLength(2);
      expect(element.textContent).toContain('title1');
      expect(element.textContent).toContain('title2');
    });
  });

  it('should load and display reviews with their summary', async () => {
    await openDetail();
    expect(reviewStoreStub.getAll).toHaveBeenCalledWith(7);
    expect(reviewStoreStub.getSummary).toHaveBeenCalledWith(7);

    expect(component.reviews()).toEqual(mockReviews);
    expect(component.reviewSummary()).toEqual(mockReviewSummary);

    const element = harness.routeNativeElement;

    expect(element?.textContent).toContain('Alice Martin');
    expect(element?.textContent).toContain('Excellent service.');
    expect(element?.textContent).toContain('19/09/2026');
  });

  it('should load and display service offerings with data', async () => {
    await openDetail();
    const element = harness.routeNativeElement;

    expect(serviceOfferingsStoreStub.getAll).toHaveBeenCalledWith(7);
    expect(component.isServiceOfferingsLoading()).toBe(false);
    expect(component.serviceOfferings()).toEqual(mockServiceOfferings);
    expect(element?.textContent).toContain('title1');
    expect(element?.textContent).toContain('title2');
    expect(element?.textContent).toContain('Gratuit');
    expect(element?.textContent).toContain('20 € / heure');
  });

  it('should load and display service offerings without data', async () => {
    serviceOfferingsStoreStub.getAll.mockReturnValue(of([]));
    await openDetail();
    const element = harness.routeNativeElement;

    expect(serviceOfferingsStoreStub.getAll).toHaveBeenCalledWith(7);
    expect(component.isServiceOfferingsLoading()).toBe(false);
    expect(component.serviceOfferings()).toEqual([]);
    expect(element?.textContent).toContain('Aucune offre de service pour le moment.');
    expect(element?.textContent).not.toContain('title1');
  });

  it('should load and display service offerings error', async () => {
    serviceOfferingsStoreStub.getAll.mockReturnValue(throwError(() => new Error()));
    await openDetail();
    const element = harness.routeNativeElement;

    expect(serviceOfferingsStoreStub.getAll).toHaveBeenCalledWith(7);
    expect(component.isServiceOfferingsLoading()).toBe(false);
    expect(component.serviceOfferings()).toEqual([]);
    expect(element?.textContent).toContain('Impossible de charger les offres.');
    expect(element?.textContent).not.toContain('title1');
    expect(component.reviews()).toEqual(mockReviews);
    expect(component.reviewSummary()).toEqual(mockReviewSummary);
    expect(element?.textContent).toContain('Alice Martin');
    expect(element?.textContent).toContain('Excellent service.');
    expect(element?.textContent).toContain('19/09/2026');
  });

  describe('offering deletion', () => {
    beforeEach(async () => {
      authSessionStub.currentUser.set(currentUserMock);
      await openDetail();
    });

    it('should preserve the offerings when confirmation is cancelled', () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
      const button = harness.routeNativeElement!.querySelector<HTMLButtonElement>(
        '.service-offering .danger-button',
      )!;

      button.click();

      expect(confirmSpy).toHaveBeenCalledExactlyOnceWith(
        `Supprimer définitivement l’offre « ${mockServiceOfferings[0].title} » ?`,
      );
      expect(serviceOfferingsStoreStub.delete).not.toHaveBeenCalled();
      expect(component.serviceOfferings()).toEqual(mockServiceOfferings);
      expect(component.deletingOfferingId()).toBeNull();
    });

    it.each([
      { scenario: 'no user is authenticated', user: null, provider: mockServiceProvider },
      {
        scenario: 'another user is authenticated',
        user: { ...currentUserMock, id: 99 },
        provider: mockServiceProvider,
      },
      {
        scenario: 'the provider has no owner',
        user: currentUserMock,
        provider: { ...mockServiceProvider, ownerUserId: null },
      },
      { scenario: 'the provider is not loaded', user: currentUserMock, provider: undefined },
    ])(
      'should hide offering deletion and ignore direct calls when $scenario',
      ({ user, provider }) => {
        authSessionStub.currentUser.set(user);
        component.serviceProvider.set(provider);
        harness.detectChanges();
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

        expect(
          harness.routeNativeElement!.querySelector('.service-offering .danger-button'),
        ).toBeNull();
        component.onDeleteOffering(mockServiceOfferings[0]);

        expect(confirmSpy).not.toHaveBeenCalled();
        expect(serviceOfferingsStoreStub.delete).not.toHaveBeenCalled();
        expect(component.serviceOfferings()).toEqual(mockServiceOfferings);
        expect(component.deletingOfferingId()).toBeNull();
      },
    );

    it('should wait for success, block overlapping deletions and remove only the selected offering', () => {
      const response$ = new Subject<void>();
      serviceOfferingsStoreStub.delete.mockReturnValue(response$.asObservable());
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const element = harness.routeNativeElement!;
      const buttons = element.querySelectorAll<HTMLButtonElement>(
        '.service-offering .danger-button',
      );
      const providerButton = element.querySelector<HTMLButtonElement>(
        '.provider-actions .danger-button',
      )!;

      buttons[0].click();
      harness.detectChanges();

      expect(serviceOfferingsStoreStub.delete).toHaveBeenCalledExactlyOnceWith(7, 1);
      expect(component.deletingOfferingId()).toBe(1);
      expect(component.serviceOfferings()).toEqual(mockServiceOfferings);
      expect(buttons[0].disabled).toBe(true);
      expect(buttons[0].textContent?.trim()).toBe('Suppression en cours...');
      expect(buttons[1].disabled).toBe(true);
      expect(buttons[1].textContent?.trim()).toBe('Supprimer cette offre');
      expect(providerButton.disabled).toBe(true);

      component.onDeleteOffering(mockServiceOfferings[0]);
      component.onDeleteOffering(mockServiceOfferings[1]);
      component.onDelete();
      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(serviceOfferingsStoreStub.delete).toHaveBeenCalledTimes(1);
      expect(serviceProvidersStoreStub.remove).not.toHaveBeenCalled();

      response$.next(undefined);
      response$.complete();
      harness.detectChanges();

      expect(component.deletingOfferingId()).toBeNull();
      expect(component.serviceOfferings()).toEqual([mockServiceOfferings[1]]);
      const remaining = element.querySelectorAll('.service-offering');
      expect(remaining).toHaveLength(1);
      expect(remaining[0].textContent).toContain('title2');
      expect(remaining[0].querySelector<HTMLButtonElement>('button')!.disabled).toBe(false);
      expect(providerButton.disabled).toBe(false);
      expect(component.serviceProvider()).toEqual(mockServiceProvider);
      expect(component.reviews()).toEqual(mockReviews);
      expect(component.reviewSummary()).toEqual(mockReviewSummary);
      expect(component.deleteOfferingError()).toBeNull();
      expect(serviceOfferingsStoreStub.getAll).toHaveBeenCalledTimes(1);
      expect(navigateSpy).not.toHaveBeenCalled();
    });

    it('should preserve the offering after failure and clear the error when retrying', () => {
      const retryResponse$ = new Subject<void>();
      serviceOfferingsStoreStub.delete
        .mockReturnValueOnce(throwError(() => new Error('Deletion failed')))
        .mockReturnValueOnce(retryResponse$.asObservable());
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      const element = harness.routeNativeElement!;
      const button = element.querySelector<HTMLButtonElement>('.service-offering .danger-button')!;

      button.click();
      harness.detectChanges();

      expect(component.serviceOfferings()).toEqual(mockServiceOfferings);
      expect(component.deletingOfferingId()).toBeNull();
      expect(button.disabled).toBe(false);
      const alerts = element.querySelectorAll('.service-offerings [role="alert"]');
      expect(alerts).toHaveLength(1);
      expect(alerts[0].textContent?.trim()).toBe(
        'Impossible de supprimer cette offre. Veuillez réessayer.',
      );
      expect(alerts[0].classList.contains('error-message')).toBe(true);
      expect(navigateSpy).not.toHaveBeenCalled();

      button.click();
      harness.detectChanges();

      expect(component.deleteOfferingError()).toBeNull();
      expect(element.querySelector('.service-offerings [role="alert"]')).toBeNull();
      expect(component.deletingOfferingId()).toBe(1);
      expect(component.serviceOfferings()).toEqual(mockServiceOfferings);
      expect(serviceOfferingsStoreStub.delete).toHaveBeenCalledTimes(2);
      expect(serviceOfferingsStoreStub.delete).toHaveBeenNthCalledWith(2, 7, 1);

      retryResponse$.next(undefined);
      retryResponse$.complete();
      harness.detectChanges();

      expect(component.deletingOfferingId()).toBeNull();
      expect(component.serviceOfferings()).toEqual([mockServiceOfferings[1]]);
      expect(element.querySelectorAll('.service-offering')).toHaveLength(1);
      expect(navigateSpy).not.toHaveBeenCalled();
    });

    it('should display the empty state after deleting the last offering', () => {
      component.serviceOfferings.set([mockServiceOfferings[0]]);
      harness.detectChanges();
      serviceOfferingsStoreStub.delete.mockReturnValue(of(undefined));
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      harness
        .routeNativeElement!.querySelector<HTMLButtonElement>('.service-offering .danger-button')!
        .click();
      harness.detectChanges();

      expect(serviceOfferingsStoreStub.delete).toHaveBeenCalledExactlyOnceWith(7, 1);
      expect(component.serviceOfferings()).toEqual([]);
      expect(harness.routeNativeElement!.querySelectorAll('.service-offering')).toHaveLength(0);
      expect(harness.routeNativeElement!.textContent).toContain(
        'Aucune offre de service pour le moment.',
      );
      expect(harness.routeNativeElement!.querySelector('.service-provider-card')).not.toBeNull();
    });

    it('should block offering deletion while the provider is being deleted', () => {
      const providerResponse$ = new Subject<void>();
      serviceProvidersStoreStub.remove.mockReturnValue(providerResponse$.asObservable());
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

      component.onDelete();
      harness.detectChanges();
      const buttons = harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>(
        '.service-offering .danger-button',
      );
      expect(buttons).toHaveLength(2);
      buttons.forEach((button) => expect(button.disabled).toBe(true));

      component.onDeleteOffering(mockServiceOfferings[0]);
      expect(confirmSpy).toHaveBeenCalledTimes(1);
      expect(serviceOfferingsStoreStub.delete).not.toHaveBeenCalled();
      expect(component.serviceOfferings()).toEqual(mockServiceOfferings);

      providerResponse$.error(new Error('Deletion failed'));
      harness.detectChanges();
      buttons.forEach((button) => expect(button.disabled).toBe(false));
    });
  });

  it('should not delete the provider when the owner cancels confirmation', async () => {
    authSessionStub.currentUser.set(currentUserMock);
    await openDetail();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const button = harness.routeNativeElement!.querySelector<HTMLButtonElement>('.danger-button');

    expect(button).not.toBeNull();
    expect(button!.textContent?.trim()).toBe('Supprimer ma fiche');
    button!.click();

    expect(confirmSpy).toHaveBeenCalledExactlyOnceWith(
      'Supprimer définitivement votre fiche ainsi que toutes ses offres et tous ses avis ?',
    );
    expect(serviceProvidersStoreStub.remove).not.toHaveBeenCalled();
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(component.isDeleting()).toBe(false);
    expect(component.serviceProvider()).toEqual(mockServiceProvider);
  });

  it.each([
    { scenario: 'no user is authenticated', user: null, provider: mockServiceProvider },
    {
      scenario: 'another user is authenticated',
      user: { ...currentUserMock, id: mockServiceProvider.id },
      provider: mockServiceProvider,
    },
    {
      scenario: 'the provider has no owner',
      user: currentUserMock,
      provider: { ...mockServiceProvider, ownerUserId: null },
    },
    { scenario: 'the provider is not loaded', user: currentUserMock, provider: undefined },
  ])('should hide deletion and ignore direct calls when $scenario', async ({ user, provider }) => {
    authSessionStub.currentUser.set(user);
    await openDetail();
    component.serviceProvider.set(provider);
    harness.detectChanges();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    expect(harness.routeNativeElement!.querySelector('.danger-button')).toBeNull();
    component.onDelete();

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(serviceProvidersStoreStub.remove).not.toHaveBeenCalled();
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(component.isDeleting()).toBe(false);
  });

  it('should disable deletion while pending and navigate only after success', async () => {
    authSessionStub.currentUser.set(currentUserMock);
    const removalResponse$ = new Subject<void>();
    serviceProvidersStoreStub.remove.mockReturnValue(removalResponse$.asObservable());
    await openDetail();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const button = harness.routeNativeElement!.querySelector<HTMLButtonElement>('.danger-button')!;

    button.click();
    harness.detectChanges();

    expect(serviceProvidersStoreStub.remove).toHaveBeenCalledExactlyOnceWith(
      mockServiceProvider.id,
    );
    expect(component.isDeleting()).toBe(true);
    expect(button.disabled).toBe(true);
    expect(button.textContent?.trim()).toBe('Suppression en cours...');
    expect(navigateSpy).not.toHaveBeenCalled();

    component.onDelete();
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(serviceProvidersStoreStub.remove).toHaveBeenCalledTimes(1);

    removalResponse$.next(undefined);
    removalResponse$.complete();
    harness.detectChanges();

    expect(component.isDeleting()).toBe(false);
    expect(button.disabled).toBe(false);
    expect(button.textContent?.trim()).toBe('Supprimer ma fiche');
    expect(navigateSpy).toHaveBeenCalledExactlyOnceWith(['/']);
    expect(component.deleteError()).toBeNull();
  });

  it('should preserve the detail page and allow retry after a deletion failure', async () => {
    authSessionStub.currentUser.set(currentUserMock);
    serviceProvidersStoreStub.remove
      .mockReturnValueOnce(throwError(() => new Error('Suppression impossible')))
      .mockReturnValueOnce(of(undefined));
    await openDetail();
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const button = harness.routeNativeElement!.querySelector<HTMLButtonElement>('.danger-button')!;

    button.click();
    harness.detectChanges();

    expect(component.isDeleting()).toBe(false);
    expect(button.disabled).toBe(false);
    expect(component.serviceProvider()).toEqual(mockServiceProvider);
    expect(harness.routeNativeElement!.querySelector('.service-provider-card')).not.toBeNull();
    expect(component.deleteError()).toBe(
      'Impossible de supprimer cette fiche. Veuillez réessayer.',
    );
    expect(harness.routeNativeElement!.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'Impossible de supprimer cette fiche. Veuillez réessayer.',
    );
    expect(navigateSpy).not.toHaveBeenCalled();

    button.click();
    harness.detectChanges();

    expect(confirmSpy).toHaveBeenCalledTimes(2);
    expect(serviceProvidersStoreStub.remove).toHaveBeenCalledTimes(2);
    expect(serviceProvidersStoreStub.remove).toHaveBeenNthCalledWith(1, mockServiceProvider.id);
    expect(serviceProvidersStoreStub.remove).toHaveBeenNthCalledWith(2, mockServiceProvider.id);
    expect(component.deleteError()).toBeNull();
    expect(harness.routeNativeElement!.querySelector('[role="alert"]')).toBeNull();
    expect(component.isDeleting()).toBe(false);
    expect(navigateSpy).toHaveBeenCalledExactlyOnceWith(['/']);
  });
});
