import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthSession } from './auth/services/auth-session';
import { LoginForm } from './auth/components/login-form/login-form';
import { ServiceRequestForm } from './service-requests/components/service-request-form/service-request-form';
import { ServiceOffering, ServicePricingType } from './models/service-offering.model';
import { ServiceProviderDetail } from './service-providers/components/service-provider-detail/service-provider-detail';
import { ServiceProviderForm } from './service-providers/components/service-provider-form/service-provider-form';
import { ServiceProvider } from './models/service-provider.model';
import { CurrentUserResponse } from './models/auth.model';
import { ServiceRequestList } from './service-requests/components/service-request-list/service-request-list';
import { ServiceOfferingForm } from './service-offerings/components/service-offering-form/service-offering-form';
import { ServiceRequest, ServiceRequestStatus } from './models/service-request.model';

describe('App routes', () => {
  const authSessionStub = {
    isAuthenticated: signal<boolean>(false),
    currentUser: signal<CurrentUserResponse | null>(null),
    isLoading: signal<boolean>(false),
    errorMessage: signal<string | null>(null),
    login: vi.fn(),
  };

  let harness: RouterTestingHarness;
  let router: Router;
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    authSessionStub.isAuthenticated.set(false);
    authSessionStub.currentUser.set(null);
    authSessionStub.isLoading.set(false);
    authSessionStub.errorMessage.set(null);
    authSessionStub.login.mockReset();

    await TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideHttpClientTesting(),
        { provide: AuthSession, useValue: authSessionStub },
      ],
    }).compileComponents();

    harness = await RouterTestingHarness.create();
    router = TestBed.inject(Router);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    httpTesting.verify();
  });

  function expectLoginRedirect(destination: string) {
    expect(router.url).toBe(`/login?returnUrl=${encodeURIComponent(destination)}`);
    expect(router.parseUrl(router.url).queryParams['returnUrl']).toBe(destination);
  }

  it('should preserve destination query parameters and fragment without loading a private page', async () => {
    const destination = '/service-requests/sent?filter=pending&search=Alice%20Martin#latest';
    await harness.navigateByUrl(destination, LoginForm);

    expectLoginRedirect(destination);
    httpTesting.expectNone('http://localhost:3000/service-requests/sent');
  });

  it('should preserve the login form and follow the latest return URL after authentication', async () => {
    const component = await harness.navigateByUrl(
      '/login?returnUrl=%2Fservice-requests%2Fsent',
      LoginForm,
    );
    component.loginForm.controls.email.setValue('alice@example.test');
    const destination = '/service-requests/received?filter=pending&search=Alice%20Martin#latest';

    const reused = await harness.navigateByUrl(
      `/login?returnUrl=${encodeURIComponent(destination)}`,
      LoginForm,
    );

    expect(reused).toBe(component);
    expect(component.loginForm.controls.email.value).toBe('alice@example.test');
    httpTesting.expectNone('http://localhost:3000/service-requests/sent');
    httpTesting.expectNone('http://localhost:3000/service-requests/received');
    const navigateSpy = vi.spyOn(router, 'navigateByUrl');
    authSessionStub.isAuthenticated.set(true);
    harness.detectChanges();
    await vi.waitFor(() => expect(navigateSpy).toHaveBeenCalledTimes(1));
    await navigateSpy.mock.results[0].value;
    harness.detectChanges();

    const [target, options] = navigateSpy.mock.calls[0];
    expect(typeof target === 'string' ? target : router.serializeUrl(target)).toBe(destination);
    expect(options).toEqual({ replaceUrl: true });
    expect(router.url).toBe(destination);
    httpTesting.expectNone('http://localhost:3000/service-requests/sent');
    const pending = httpTesting.expectOne('http://localhost:3000/service-requests/received');
    expect(pending.request.method).toBe('GET');
    pending.flush([]);
  });

  it('should redirect unauthenticated users from service request creation to login', async () => {
    await harness.navigateByUrl(
      '/service-providers/7/service-offerings/12/service-requests/new',
      LoginForm,
    );

    expectLoginRedirect('/service-providers/7/service-offerings/12/service-requests/new');
  });

  it('should allow authenticated users to create a service request and preserve both route ids', async () => {
    authSessionStub.isAuthenticated.set(true);
    const component = await harness.navigateByUrl(
      '/service-providers/7/service-offerings/12/service-requests/new',
      ServiceRequestForm,
    );

    expect(router.url).toBe('/service-providers/7/service-offerings/12/service-requests/new');
    expect(component.serviceProviderId).toBe(7);
    expect(component.serviceOfferingId).toBe(12);
    expect(component.isLoading()).toBe(true);
    const offering: ServiceOffering = {
      id: 12,
      serviceProviderId: 7,
      title: 'Conseil gratuit',
      description: 'Conseils pour repeindre une chambre.',
      pricingType: ServicePricingType.FREE,
      hourlyRate: null,
    };
    const pending = httpTesting.expectOne(
      'http://localhost:3000/service-providers/7/service-offerings/12',
    );
    expect(pending.request.method).toBe('GET');
    pending.flush(offering);
    httpTesting.expectNone('http://localhost:3000/service-providers/7/service-offerings');
    expect(component.serviceOffering()).toEqual(offering);
    expect(component.isLoading()).toBe(false);
  });

  it('should reuse request creation across route ids and cancel the previous HTTP submission', async () => {
    authSessionStub.isAuthenticated.set(true);
    const component = await harness.navigateByUrl(
      '/service-providers/7/service-offerings/12/service-requests/new',
      ServiceRequestForm,
    );
    const initial: ServiceOffering = {
      id: 12,
      serviceProviderId: 7,
      title: 'Peinture',
      description: 'Peinture intérieure.',
      pricingType: ServicePricingType.HOURLY,
      hourlyRate: 35,
    };
    httpTesting
      .expectOne('http://localhost:3000/service-providers/7/service-offerings/12')
      .flush(initial);
    component.serviceRequestForm.controls.message.setValue('Premier message');
    component.onSubmit();
    const oldSubmission = httpTesting.expectOne(
      'http://localhost:3000/service-providers/7/service-offerings/12/service-requests',
    );
    expect(oldSubmission.request.method).toBe('POST');
    expect(oldSubmission.cancelled).toBe(false);

    const reused = await harness.navigateByUrl(
      '/service-providers/8/service-offerings/13/service-requests/new',
      ServiceRequestForm,
    );

    expect(reused).toBe(component);
    expect(oldSubmission.cancelled).toBe(true);
    expect(component.serviceProviderId).toBe(8);
    expect(component.serviceOfferingId).toBe(13);
    expect(component.isSubmitting()).toBe(false);
    expect(component.isLoading()).toBe(true);
    expect(component.serviceOffering()).toBeNull();
    expect(component.serviceRequestForm.controls.message.value).toBe('');
    expect(harness.routeNativeElement?.querySelector('h3')).toBeNull();
    expect(harness.routeNativeElement?.textContent).not.toContain('35 € / heure');
    const next: ServiceOffering = {
      ...initial,
      id: 13,
      serviceProviderId: 8,
      title: 'Conseil gratuit',
      pricingType: ServicePricingType.FREE,
      hourlyRate: null,
    };
    httpTesting
      .expectOne('http://localhost:3000/service-providers/8/service-offerings/13')
      .flush(next);
    harness.detectChanges();
    expect(component.serviceOffering()).toEqual(next);
    expect(harness.routeNativeElement?.textContent).toContain('Conseil gratuit');
    expect(harness.routeNativeElement?.textContent).toContain('Prestation gratuite');
    expect(harness.routeNativeElement?.querySelector('a')?.getAttribute('href')).toBe(
      '/service-providers/8',
    );
    expect(router.url).toBe('/service-providers/8/service-offerings/13/service-requests/new');
  });

  it.each([
    { status: 404, statusText: 'Not Found', message: 'Cette offre de service est introuvable.' },
    {
      status: 500,
      statusText: 'Internal Server Error',
      message: 'Impossible de charger cette offre de service. Veuillez réessayer.',
    },
  ])(
    'should hide request creation and block submission after a real HTTP $status response',
    async ({ status, statusText, message }) => {
      authSessionStub.isAuthenticated.set(true);
      const component = await harness.navigateByUrl(
        '/service-providers/7/service-offerings/12/service-requests/new',
        ServiceRequestForm,
      );
      httpTesting
        .expectOne('http://localhost:3000/service-providers/7/service-offerings/12')
        .flush({ message: 'Lookup failed' }, { status, statusText });
      harness.detectChanges();

      expect(component.isLoading()).toBe(false);
      expect(component.serviceOffering()).toBeNull();
      expect(harness.routeNativeElement?.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
        message,
      );
      expect(harness.routeNativeElement?.querySelector('form')).toBeNull();
      expect(harness.routeNativeElement?.querySelector('a')?.getAttribute('href')).toBe(
        '/service-providers/7',
      );
      component.serviceRequestForm.controls.message.setValue('Bonjour pour cette prestation.');
      component.onSubmit();
      httpTesting.expectNone(
        'http://localhost:3000/service-providers/7/service-offerings/12/service-requests',
      );
      httpTesting.expectNone('http://localhost:3000/service-providers/7/service-offerings');
    },
  );

  it('should cancel a pending single-offering HTTP load when the request route changes', async () => {
    authSessionStub.isAuthenticated.set(true);
    const component = await harness.navigateByUrl(
      '/service-providers/7/service-offerings/12/service-requests/new',
      ServiceRequestForm,
    );
    const previous = httpTesting.expectOne(
      'http://localhost:3000/service-providers/7/service-offerings/12',
    );
    component.serviceRequestForm.controls.message.setValue('Ancien brouillon');
    expect(previous.cancelled).toBe(false);

    expect(
      await harness.navigateByUrl(
        '/service-providers/8/service-offerings/13/service-requests/new',
        ServiceRequestForm,
      ),
    ).toBe(component);

    expect(previous.cancelled).toBe(true);
    expect(component.isLoading()).toBe(true);
    expect(component.serviceOffering()).toBeNull();
    expect(component.serviceRequestForm.controls.message.value).toBe('');
    const next: ServiceOffering = {
      id: 13,
      serviceProviderId: 8,
      title: 'Nouvelle prestation',
      description: 'Conseil gratuit.',
      pricingType: ServicePricingType.FREE,
      hourlyRate: null,
    };
    httpTesting
      .expectOne('http://localhost:3000/service-providers/8/service-offerings/13')
      .flush(next);
    harness.detectChanges();

    expect(component.isLoading()).toBe(false);
    expect(component.serviceOffering()).toEqual(next);
    expect(harness.routeNativeElement?.querySelector('h3')?.textContent).toBe(next.title);
    expect(harness.routeNativeElement?.textContent).toContain('Prestation gratuite');
    httpTesting.expectNone('http://localhost:3000/service-providers/7/service-offerings');
    httpTesting.expectNone('http://localhost:3000/service-providers/8/service-offerings');
  });

  it('should prefill offering editing from the single-offering endpoint without downloading the list', async () => {
    const user: CurrentUserResponse = {
      id: 42,
      firstName: 'Alice',
      lastName: 'Martin',
      email: 'alice@example.test',
    };
    authSessionStub.isAuthenticated.set(true);
    authSessionStub.currentUser.set(user);
    const component = await harness.navigateByUrl(
      '/service-providers/7/service-offerings/12/edit',
      ServiceOfferingForm,
    );
    const offering: ServiceOffering = {
      id: 12,
      serviceProviderId: 7,
      title: 'Conseil gratuit',
      description: 'Conseils pour votre installation.',
      pricingType: ServicePricingType.FREE,
      hourlyRate: null,
    };
    const provider = httpTesting.expectOne('http://localhost:3000/service-providers/7');
    const selectedOffering = httpTesting.expectOne(
      'http://localhost:3000/service-providers/7/service-offerings/12',
    );
    expect(provider.request.method).toBe('GET');
    expect(selectedOffering.request.method).toBe('GET');
    selectedOffering.flush(offering);
    expect(component.isLoading()).toBe(true);
    expect(component.serviceOfferingForm.controls.title.value).toBe('');

    provider.flush({ id: 7, ownerUserId: user.id });
    harness.detectChanges();

    httpTesting.expectNone('http://localhost:3000/service-providers/7/service-offerings');
    expect(component.isLoading()).toBe(false);
    expect(component.loadError()).toBeNull();
    expect(component.serviceOfferingForm.getRawValue()).toEqual({
      title: offering.title,
      description: offering.description,
      pricingType: ServicePricingType.FREE,
      hourlyRate: null,
    });
    expect(component.serviceOfferingForm.valid).toBe(true);
    expect(harness.routeNativeElement?.querySelector('form')).not.toBeNull();
  });

  it('should redirect unauthenticated users from provider creation to login', async () => {
    await harness.navigateByUrl('/service-providers/new', LoginForm);
    expectLoginRedirect('/service-providers/new');
  });

  it('should redirect unauthenticated users from provider editing to login', async () => {
    await harness.navigateByUrl('/service-providers/7/edit', LoginForm);
    expectLoginRedirect('/service-providers/7/edit');
  });

  it('should open the provider edit form through the real route and prefill the owned profile', async () => {
    const user: CurrentUserResponse = {
      id: 42,
      firstName: 'Alice',
      lastName: 'Martin',
      email: 'alice@example.test',
    };
    const provider: ServiceProvider = {
      id: 7,
      ownerUserId: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      profession: 'Peintre',
      city: 'Paris',
      description: 'Travaux de peinture intérieure et rénovation.',
      hourlyRate: 35,
      available: true,
      imageUrl: '',
    };
    authSessionStub.isAuthenticated.set(true);
    authSessionStub.currentUser.set(user);

    const component = await harness.navigateByUrl('/service-providers/7/edit', ServiceProviderForm);

    expect(component.isEditMode).toBe(true);
    expect(component.serviceProviderId).toBe(7);
    expect(component.isLoading()).toBe(true);
    const pending = httpTesting.expectOne('http://localhost:3000/service-providers/7');
    expect(pending.request.method).toBe('GET');
    pending.flush(provider);
    harness.detectChanges();

    expect(component.isLoading()).toBe(false);
    expect(component.serviceProviderForm.controls.profession.value).toBe('Peintre');
    expect(component.serviceProviderForm.controls.city.value).toBe('Paris');
    expect(harness.routeNativeElement?.querySelector('h2')?.textContent?.trim()).toBe(
      'Modifier ma fiche',
    );
    expect(harness.routeNativeElement?.querySelector<HTMLInputElement>('#profession')?.value).toBe(
      'Peintre',
    );
    httpTesting.expectNone('http://localhost:3000/service-providers/7/service-offerings');
  });

  it('should redirect unauthenticated users from offering editing to login', async () => {
    await harness.navigateByUrl('/service-providers/7/service-offerings/2/edit', LoginForm);
    expectLoginRedirect('/service-providers/7/service-offerings/2/edit');
  });

  it('should redirect unauthenticated users from offering creation to login', async () => {
    await harness.navigateByUrl('/service-providers/7/service-offerings/new', LoginForm);
    expectLoginRedirect('/service-providers/7/service-offerings/new');
  });

  describe('request navigation from an offering', () => {
    const offering: ServiceOffering = {
      id: 12,
      serviceProviderId: 7,
      title: 'Peinture',
      description: 'Peinture intérieure.',
      pricingType: ServicePricingType.HOURLY,
      hourlyRate: 35,
    };
    const provider: ServiceProvider = {
      id: 7,
      ownerUserId: 42,
      firstName: 'Alice',
      lastName: 'Martin',
      profession: 'Peintre',
      city: 'Paris',
      description: 'Peinture intérieure.',
      hourlyRate: 35,
      imageUrl: '',
      available: true,
    };

    async function openProviderDetail() {
      await harness.navigateByUrl('/service-providers/7', ServiceProviderDetail);
      httpTesting.expectOne('http://localhost:3000/service-providers/7').flush(provider);
      httpTesting.expectOne('http://localhost:3000/service-providers/7/reviews').flush([]);
      httpTesting.expectOne('http://localhost:3000/service-providers/7/reviews/summary').flush({
        reviewCount: 0,
        averageRating: null,
      });
      httpTesting
        .expectOne('http://localhost:3000/service-providers/7/service-offerings')
        .flush([offering]);
      harness.detectChanges();
      const link = harness.routeNativeElement!.querySelector<HTMLAnchorElement>(
        'a[href="/service-providers/7/service-offerings/12/service-requests/new"]',
      );
      expect(link?.textContent?.trim()).toBe('Demander cette prestation');
      return link!;
    }

    it('should redirect an anonymous visitor to login after clicking an offering request link', async () => {
      const link = await openProviderDetail();

      link.click();
      await harness.fixture.whenStable();
      harness.detectChanges();

      expectLoginRedirect('/service-providers/7/service-offerings/12/service-requests/new');
      expect(harness.routeNativeElement?.querySelector('h2')?.textContent?.trim()).toBe(
        'Connexion',
      );
    });

    it('should open the selected offering request form after a signed-in visitor clicks its link', async () => {
      authSessionStub.isAuthenticated.set(true);
      authSessionStub.currentUser.set({
        id: 99,
        firstName: 'Bruno',
        lastName: 'Leroy',
        email: 'bruno@example.com',
      });
      const link = await openProviderDetail();

      link.click();
      await harness.fixture.whenStable();
      harness.detectChanges();

      expect(router.url).toBe('/service-providers/7/service-offerings/12/service-requests/new');
      httpTesting
        .expectOne('http://localhost:3000/service-providers/7/service-offerings/12')
        .flush(offering);
      harness.detectChanges();
      expect(harness.routeNativeElement?.querySelector('h2')?.textContent?.trim()).toBe(
        'Envoyer une demande',
      );
      expect(harness.routeNativeElement?.querySelector('h3')?.textContent?.trim()).toBe('Peinture');
      expect(harness.routeNativeElement?.querySelector('form')).not.toBeNull();
      expect(authSessionStub.isAuthenticated()).toBe(true);
    });
  });

  describe('private request list routes', () => {
    const sentRequest: ServiceRequest = {
      id: 42,
      message: 'Bonjour, je souhaite un conseil.',
      status: ServiceRequestStatus.SENT,
      hasReview: false,
      createdAt: '2026-10-12T10:30:00.000Z',
      requesterUserId: 8,
      recipientUserId: 9,
      serviceOfferingId: null,
      serviceProviderId: null,
      offeringTitleSnapshot: 'Conseil gratuit',
      offeringPricingTypeSnapshot: ServicePricingType.FREE,
      offeringHourlyRateSnapshot: null,
      requester: { id: 8, firstName: 'Alice', lastName: 'Martin' },
      recipient: { id: 9, firstName: 'Bruno', lastName: 'Leroy' },
    };
    const receivedRequest: ServiceRequest = {
      ...sentRequest,
      id: 43,
      requesterUserId: 9,
      recipientUserId: 8,
      requester: sentRequest.recipient,
      recipient: sentRequest.requester,
    };

    it.each(['sent', 'received'])(
      'should redirect unauthenticated users from the %s request list to login without fetching requests',
      async (direction) => {
        await harness.navigateByUrl(`/service-requests/${direction}`, LoginForm);

        expectLoginRedirect(`/service-requests/${direction}`);
        httpTesting.expectNone('http://localhost:3000/service-requests/sent');
        httpTesting.expectNone('http://localhost:3000/service-requests/received');
      },
    );

    it.each([
      { direction: 'sent', response: sentRequest, unused: 'received' },
      { direction: 'received', response: receivedRequest, unused: 'sent' },
    ])(
      'should open the authenticated $direction list and fetch only its endpoint',
      async ({ direction, response, unused }) => {
        authSessionStub.isAuthenticated.set(true);
        const component = await harness.navigateByUrl(
          `/service-requests/${direction}`,
          ServiceRequestList,
        );

        expect(router.url).toBe(`/service-requests/${direction}`);
        expect(component.isSentMode).toBe(direction === 'sent');
        expect(component.isLoading()).toBe(true);
        const pending = httpTesting.expectOne(
          `http://localhost:3000/service-requests/${direction}`,
        );
        expect(pending.request.method).toBe('GET');
        httpTesting.expectNone(`http://localhost:3000/service-requests/${unused}`);
        pending.flush([response]);
        expect(component.serviceRequests()).toEqual([response]);
        expect(component.isLoading()).toBe(false);
        expect(component.loadError()).toBeNull();
      },
    );

    it('should restore the published review confirmation from a fresh API response when returning to sent requests', async () => {
      authSessionStub.isAuthenticated.set(true);
      const reviewed: ServiceRequest = {
        ...sentRequest,
        status: ServiceRequestStatus.COMPLETED,
        hasReview: true,
        serviceProviderId: 7,
      };
      const first = await harness.navigateByUrl('/service-requests/sent', ServiceRequestList);
      httpTesting.expectOne('http://localhost:3000/service-requests/sent').flush([reviewed]);
      harness.detectChanges();
      expect(harness.routeNativeElement?.querySelector('.review-success')?.textContent).toContain(
        'Votre avis a été publié',
      );
      expect(harness.routeNativeElement?.querySelector('app-review-form')).toBeNull();

      await harness.navigateByUrl('/service-requests/received', ServiceRequestList);
      httpTesting.expectOne('http://localhost:3000/service-requests/received').flush([]);
      const second = await harness.navigateByUrl('/service-requests/sent', ServiceRequestList);
      expect(second).not.toBe(first);
      expect(second.isLoading()).toBe(true);
      expect(second.serviceRequests()).toEqual([]);
      httpTesting.expectOne('http://localhost:3000/service-requests/sent').flush([{ ...reviewed }]);
      harness.detectChanges();

      expect(second.serviceRequests()[0].hasReview).toBe(true);
      expect(harness.routeNativeElement?.querySelector('.review-success')?.textContent).toContain(
        'Votre avis a été publié',
      );
      expect(harness.routeNativeElement?.textContent).not.toContain('Donner mon avis');
      expect(harness.routeNativeElement?.querySelector('app-review-form')).toBeNull();
      httpTesting.expectNone((request) => request.method === 'POST');
    });

    it('should switch from sent to received requests using the new route data', async () => {
      authSessionStub.isAuthenticated.set(true);
      const sentComponent = await harness.navigateByUrl(
        '/service-requests/sent',
        ServiceRequestList,
      );
      httpTesting.expectOne('http://localhost:3000/service-requests/sent').flush([sentRequest]);
      expect(sentComponent.serviceRequests()).toEqual([sentRequest]);

      const receivedComponent = await harness.navigateByUrl(
        '/service-requests/received',
        ServiceRequestList,
      );

      expect(receivedComponent.isSentMode).toBe(false);
      expect(receivedComponent.isLoading()).toBe(true);
      expect(receivedComponent.serviceRequests()).toEqual([]);
      httpTesting
        .expectOne('http://localhost:3000/service-requests/received')
        .flush([receivedRequest]);
      expect(receivedComponent.serviceRequests()).toEqual([receivedRequest]);
      expect(receivedComponent.isLoading()).toBe(false);
      expect(router.url).toBe('/service-requests/received');
    });
  });
});
