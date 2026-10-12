import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { signal } from '@angular/core';
import { CurrentUserResponse } from './models/auth.model';
import { AuthSession } from './auth/services/auth-session';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { routes } from './app.routes';
import { ServiceRequest, ServiceRequestStatus } from './models/service-request.model';
import { ServicePricingType } from './models/service-offering.model';

describe('App', () => {
  const authSessionStub = {
    currentUser: signal<CurrentUserResponse | null>(null),
    logout: vi.fn(),
  };

  beforeEach(async () => {
    authSessionStub.currentUser.set(null);
    authSessionStub.logout.mockReset();

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), { provide: AuthSession, useValue: authSessionStub }],
    }).compileComponents();
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render title', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Entraide');
  });

  it('should show the login link when no user is authenticated', async () => {
    const fixture = TestBed.createComponent(App);

    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[href="/login"]')).toBeTruthy();
  });

  it('should show the user name and logout button when authenticated', () => {
    const fixture = TestBed.createComponent(App);

    authSessionStub.currentUser.set({
      id: 1,
      firstName: 'Alice',
      lastName: 'Martin',
      email: 'alicemartin@example.com',
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('nav').textContent).toContain('Alice Martin');
    expect(fixture.nativeElement.querySelector('nav button').textContent).toContain(
      'Se déconnecter',
    );
    expect(fixture.nativeElement.querySelector('a[href="/login"]')).toBeNull();
  });

  it('should call logout when the logout button is clicked', () => {
    const fixture = TestBed.createComponent(App);

    authSessionStub.currentUser.set({
      id: 1,
      firstName: 'Alice',
      lastName: 'Martin',
      email: 'alicemartin@example.com',
    });
    fixture.detectChanges();
    fixture.nativeElement.querySelector('nav button').click();
    expect(authSessionStub.logout).toHaveBeenCalledTimes(1);
  });

  describe('request links in the header', () => {
    const user: CurrentUserResponse = {
      id: 8,
      firstName: 'Alice',
      lastName: 'Martin',
      email: 'alice@example.com',
    };

    it('should show both private request links with the correct destinations when signed in', () => {
      authSessionStub.currentUser.set(user);
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;

      expect(element.querySelector('a[href="/service-requests/sent"]')?.textContent?.trim()).toBe(
        'Demandes envoyées',
      );
      expect(
        element.querySelector('a[href="/service-requests/received"]')?.textContent?.trim(),
      ).toBe('Demandes reçues');
    });

    it('should hide both private request links from anonymous visitors', () => {
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;

      expect(element.querySelector('a[href="/service-requests/sent"]')).toBeNull();
      expect(element.querySelector('a[href="/service-requests/received"]')).toBeNull();
      expect(element.querySelector('a[href="/login"]')).not.toBeNull();
    });

    it('should replace private request links with sign-in links after logout', () => {
      authSessionStub.currentUser.set(user);
      authSessionStub.logout.mockImplementation(() => authSessionStub.currentUser.set(null));
      const fixture = TestBed.createComponent(App);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;

      element.querySelector<HTMLButtonElement>('nav button')!.click();
      fixture.detectChanges();

      expect(authSessionStub.logout).toHaveBeenCalledTimes(1);
      expect(element.querySelector('a[href="/service-requests/sent"]')).toBeNull();
      expect(element.querySelector('a[href="/service-requests/received"]')).toBeNull();
      expect(element.querySelector('a[href="/login"]')).not.toBeNull();
      expect(element.querySelector('.session-user')).toBeNull();
    });
  });
});

describe('App request navigation', () => {
  const user: CurrentUserResponse = {
    id: 8,
    firstName: 'Alice',
    lastName: 'Martin',
    email: 'alice@example.com',
  };
  const authSessionStub = {
    currentUser: signal<CurrentUserResponse | null>(null),
    isAuthenticated: signal(false),
    isLoading: signal(false),
    errorMessage: signal<string | null>(null),
    login: vi.fn(),
    logout: vi.fn(),
  };
  const sentRequest: ServiceRequest = {
    id: 42,
    message: 'Message privé de la demande',
    status: ServiceRequestStatus.SENT,
    createdAt: '2026-10-12T10:30:00.000Z',
    requesterUserId: 8,
    recipientUserId: 9,
    serviceOfferingId: null,
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
  let fixture: ComponentFixture<App>;
  let router: Router;
  let httpTesting: HttpTestingController;

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  async function openList(direction: string, complete = true) {
    await router.navigateByUrl(`/service-requests/${direction}`);
    fixture.detectChanges();
    const pending = httpTesting.expectOne(`http://localhost:3000/service-requests/${direction}`);
    if (complete) {
      pending.flush([direction === 'sent' ? sentRequest : receivedRequest]);
      fixture.detectChanges();
    }
    return pending;
  }

  beforeEach(async () => {
    authSessionStub.currentUser.set(user);
    authSessionStub.isAuthenticated.set(true);
    authSessionStub.isLoading.set(false);
    authSessionStub.errorMessage.set(null);
    authSessionStub.login.mockReset();
    authSessionStub.logout.mockReset().mockImplementation(() => {
      authSessionStub.currentUser.set(null);
      authSessionStub.isAuthenticated.set(false);
    });
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        provideHttpClientTesting(),
        { provide: AuthSession, useValue: authSessionStub },
      ],
    }).compileComponents();
    router = TestBed.inject(Router);
    httpTesting = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(App);
    fixture.detectChanges();
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it.each([
    { direction: 'sent', title: 'Mes demandes envoyées' },
    { direction: 'received', title: 'Mes demandes reçues' },
  ])(
    'should open the $direction list from its header link without clearing the session',
    async ({ direction, title }) => {
      element()
        .querySelector<HTMLAnchorElement>(`a[href="/service-requests/${direction}"]`)!
        .click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(router.url).toBe(`/service-requests/${direction}`);
      httpTesting
        .expectOne(`http://localhost:3000/service-requests/${direction}`)
        .flush([direction === 'sent' ? sentRequest : receivedRequest]);
      fixture.detectChanges();
      expect(element().querySelector('main h2')?.textContent?.trim()).toBe(title);
      expect(element().querySelector('main .service-request')).not.toBeNull();
      expect(authSessionStub.currentUser()).toEqual(user);
      expect(authSessionStub.isAuthenticated()).toBe(true);
    },
  );

  it.each(['sent', 'received'])(
    'should remove private %s requests and open login when the logout button is clicked',
    async (direction) => {
      await openList(direction);
      expect(element().querySelector('main .service-request')).not.toBeNull();

      element().querySelector<HTMLButtonElement>('nav button')!.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(authSessionStub.logout).toHaveBeenCalledTimes(1);
      expect(authSessionStub.currentUser()).toBeNull();
      expect(authSessionStub.isAuthenticated()).toBe(false);
      expect(element().querySelector('main .service-request')).toBeNull();
      expect(element().textContent).not.toContain(sentRequest.message);
      expect(router.url).toBe('/login');
      expect(element().querySelector('main h2')?.textContent?.trim()).toBe('Connexion');
    },
  );

  it('should not display a late private response after logout during list loading', async () => {
    const pending = await openList('sent', false);
    expect(element().querySelector('main [role="status"]')).not.toBeNull();

    element().querySelector<HTMLButtonElement>('nav button')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    pending.flush([sentRequest]);
    fixture.detectChanges();

    expect(authSessionStub.currentUser()).toBeNull();
    expect(element().querySelector('main .service-request')).toBeNull();
    expect(element().textContent).not.toContain(sentRequest.message);
    expect(router.url).toBe('/login');
  });
});
