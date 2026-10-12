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
import { ServiceProvider } from './models/service-provider.model';
import { CurrentUserResponse } from './models/auth.model';

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
    httpTesting.verify();
  });

  it('should redirect unauthenticated users from service request creation to login', async () => {
    await harness.navigateByUrl(
      '/service-providers/7/service-offerings/12/service-requests/new',
      LoginForm,
    );

    expect(router.url).toBe('/login');
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
      'http://localhost:3000/service-providers/7/service-offerings',
    );
    expect(pending.request.method).toBe('GET');
    pending.flush([offering]);
    expect(component.serviceOffering()).toEqual(offering);
    expect(component.isLoading()).toBe(false);
  });

  it('should redirect unauthenticated users from provider creation to login', async () => {
    await harness.navigateByUrl('/service-providers/new', LoginForm);
    expect(router.url).toBe('/login');
  });

  it('should redirect unauthenticated users from provider editing to login', async () => {
    await harness.navigateByUrl('/service-providers/7/edit', LoginForm);
    expect(router.url).toBe('/login');
  });

  it('should redirect unauthenticated users from offering editing to login', async () => {
    await harness.navigateByUrl('/service-providers/7/service-offerings/2/edit', LoginForm);
    expect(router.url).toBe('/login');
  });

  it('should redirect unauthenticated users from offering creation to login', async () => {
    await harness.navigateByUrl('/service-providers/7/service-offerings/new', LoginForm);
    expect(router.url).toBe('/login');
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

      expect(router.url).toBe('/login');
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
        .expectOne('http://localhost:3000/service-providers/7/service-offerings')
        .flush([offering]);
      harness.detectChanges();
      expect(harness.routeNativeElement?.querySelector('h2')?.textContent?.trim()).toBe(
        'Envoyer une demande',
      );
      expect(harness.routeNativeElement?.querySelector('h3')?.textContent?.trim()).toBe('Peinture');
      expect(harness.routeNativeElement?.querySelector('form')).not.toBeNull();
      expect(authSessionStub.isAuthenticated()).toBe(true);
    });
  });
});
