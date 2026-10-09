import { TestBed } from '@angular/core/testing';
import { ServiceProviderDetail } from './service-provider-detail';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, Subject, throwError } from 'rxjs';
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
  };
  const authSessionStub = {
    currentUser: signal<CurrentUserResponse | null>(null),
  };

  let component: ServiceProviderDetail;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    serviceProvidersStoreStub.remove.mockReset();
    reviewStoreStub.getAll.mockReset().mockReturnValue(of(mockReviews));
    reviewStoreStub.getSummary.mockReset().mockReturnValue(of(mockReviewSummary));
    serviceOfferingsStoreStub.getAll.mockReset().mockReturnValue(of(mockServiceOfferings));
    authSessionStub.currentUser.set(null);

    await TestBed.configureTestingModule({
      imports: [ServiceProviderDetail],
      providers: [
        provideRouter([
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

  it('should create', async () => {
    await openDetail();
    expect(component).toBeTruthy();
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
      expect(element.querySelectorAll('.service-offering a')).toHaveLength(0);
      expect(element.querySelectorAll('.service-offering')).toHaveLength(2);
      expect(element.textContent).toContain('title1');
      expect(element.textContent).toContain('title2');
    },
  );

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
