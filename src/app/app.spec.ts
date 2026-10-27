import { of, tap, throwError } from 'rxjs';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { DOCUMENT, signal } from '@angular/core';
import { CurrentUserResponse } from './models/auth.model';
import { AuthSession } from './auth/services/auth-session';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { routes } from './app.routes';
import { ServiceRequest, ServiceRequestStatus } from './models/service-request.model';
import { ServicePricingType } from './models/service-offering.model';
import { unreadMessageState } from './service-requests/services/unread-message-store';
import type { ServiceRequestUnreadMessageCounts } from './models/service-request-unread-message-counts.model';
import { HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './auth/interceptors/auth-interceptor';

describe('App', () => {
  const unreadStoreStub = {
    reset: vi.fn(),
    refresh: vi.fn(),
    isLoading: signal(false),
    counts: signal<ServiceRequestUnreadMessageCounts | null>(null),
  };
  const authSessionStub = {
    currentUser: signal<CurrentUserResponse | null>(null),
    logout: vi.fn(),
  };

  beforeEach(async () => {
    unreadStoreStub.counts.set(null);
    unreadStoreStub.isLoading.set(false);
    unreadStoreStub.reset.mockReset().mockImplementation(() => unreadStoreStub.counts.set(null));
    unreadStoreStub.refresh.mockReset();
    authSessionStub.currentUser.set(null);
    authSessionStub.logout.mockReset();

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        { provide: AuthSession, useValue: authSessionStub },
        { provide: unreadMessageState, useValue: unreadStoreStub },
      ],
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
  const unreadStoreStub = {
    reset: vi.fn(),
    refresh: vi.fn(),
    isLoading: signal(false),
    counts: signal<ServiceRequestUnreadMessageCounts | null>(null),
  };
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
    unreadStoreStub.counts.set(null);
    unreadStoreStub.isLoading.set(false);
    unreadStoreStub.reset.mockReset().mockImplementation(() => unreadStoreStub.counts.set(null));
    unreadStoreStub.refresh.mockReset();
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
        { provide: unreadMessageState, useValue: unreadStoreStub },
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
      expect(element().querySelectorAll('nav a.nav-link-active')).toHaveLength(1);
      const activeLink = element().querySelector<HTMLAnchorElement>('nav a.nav-link-active')!;
      expect(activeLink.getAttribute('href')).toBe(`/service-requests/${direction}`);
      expect(activeLink.getAttribute('aria-current')).toBe('page');
      const inactiveLinks = element().querySelectorAll('nav a:not(.nav-link-active)');
      for (const link of inactiveLinks) {
        expect(link.hasAttribute('aria-current')).toBe(false);
      }
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

  it('should move the active navigation class and aria-current between home and both request lists', async () => {
    async function navigateAndCheck(path: string) {
      await router.navigateByUrl(path);
      fixture.detectChanges();
      if (path === '/') {
        httpTesting
          .expectOne(
            (request) =>
              request.method === 'GET' && request.url === 'http://localhost:3000/service-providers',
          )
          .flush({ data: [], total: 0, page: 1, limit: 10, totalPages: 0 });
      } else {
        httpTesting.expectOne(`http://localhost:3000${path}`).flush([]);
      }
      await fixture.whenStable();
      fixture.detectChanges();
      const links = element().querySelectorAll<HTMLAnchorElement>('nav a');
      expect(element().querySelectorAll('nav a.nav-link-active')).toHaveLength(1);
      expect(element().querySelectorAll('nav a[aria-current="page"]')).toHaveLength(1);
      for (const link of links) {
        const shouldBeActive = link.getAttribute('href') === path;
        expect(link.classList.contains('nav-link-active')).toBe(shouldBeActive);
        expect(link.getAttribute('aria-current')).toBe(shouldBeActive ? 'page' : null);
      }
    }

    for (const path of ['/', '/service-requests/sent', '/service-requests/received', '/']) {
      await navigateAndCheck(path);
    }
    expect(authSessionStub.isAuthenticated()).toBe(true);
  });

  it('should move the active navigation class and aria-current between login and registration for anonymous visitors', async () => {
    authSessionStub.currentUser.set(null);
    authSessionStub.isAuthenticated.set(false);
    fixture.detectChanges();

    for (const path of ['/login', '/register', '/login']) {
      element().querySelector<HTMLAnchorElement>(`nav a[href="${path}"]`)!.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(router.url).toBe(path);
      expect(element().querySelectorAll('nav a.nav-link-active')).toHaveLength(1);
      expect(element().querySelectorAll('nav a[aria-current="page"]')).toHaveLength(1);
      for (const link of element().querySelectorAll<HTMLAnchorElement>('nav a')) {
        const active = link.getAttribute('href') === path;
        expect(link.classList.contains('nav-link-active')).toBe(active);
        expect(link.getAttribute('aria-current')).toBe(active ? 'page' : null);
      }
      expect(element().querySelector('nav a[href="/service-requests/sent"]')).toBeNull();
      expect(element().querySelector('nav a[href="/service-requests/received"]')).toBeNull();
    }
    httpTesting.expectNone(() => true);
  });

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
      expect(element().querySelectorAll('nav a.nav-link-active')).toHaveLength(1);
      expect(element().querySelector('nav a.nav-link-active')?.getAttribute('href')).toBe('/login');
      expect(element().querySelector('nav a[href="/login"]')?.getAttribute('aria-current')).toBe(
        'page',
      );
      expect(element().querySelector('nav a[href="/register"]')?.hasAttribute('aria-current')).toBe(
        false,
      );
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

describe('App unread message session synchronization', () => {
  const url = 'http://localhost:3000/service-requests/messages/unread-counts';
  const userA: CurrentUserResponse = {
    id: 8,
    firstName: 'Alice',
    lastName: 'Martin',
    email: 'alice@example.com',
  };
  const userB: CurrentUserResponse = {
    id: 9,
    firstName: 'Bruno',
    lastName: 'Leroy',
    email: 'bruno@example.com',
  };
  const authSessionStub = {
    currentUser: signal<CurrentUserResponse | null>(null),
    accessToken: signal<string | null>(null),
    logout: vi.fn(),
    clearSession: vi.fn(),
    renewAccessToken: vi.fn(),
  };
  let fixture: ComponentFixture<App>;
  let httpTesting: HttpTestingController;
  let countsStore: InstanceType<typeof unreadMessageState>;

  function signIn(user = userA, token = 'token-a') {
    authSessionStub.accessToken.set(token);
    authSessionStub.currentUser.set(user);
    fixture.detectChanges();
    return httpTesting.expectOne(url);
  }

  beforeEach(async () => {
    authSessionStub.currentUser.set(null);
    authSessionStub.accessToken.set(null);
    const resetLocal = () => {
      authSessionStub.currentUser.set(null);
      authSessionStub.accessToken.set(null);
    };
    authSessionStub.renewAccessToken
      .mockReset()
      .mockImplementation(() => throwError(() => new HttpErrorResponse({ status: 401 })));
    authSessionStub.logout.mockReset().mockImplementation(resetLocal);
    authSessionStub.clearSession.mockReset().mockImplementation(resetLocal);
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthSession, useValue: authSessionStub },
      ],
    }).compileComponents();
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    httpTesting = TestBed.inject(HttpTestingController);
    countsStore = TestBed.inject(unreadMessageState);
    fixture = TestBed.createComponent(App);
  });

  afterEach(() => {
    httpTesting.verify();
    vi.restoreAllMocks();
  });

  it('should keep anonymous counts unknown without making an authenticated request', () => {
    fixture.detectChanges();

    expect(countsStore.counts()).toBeNull();
    expect(countsStore.isLoading()).toBe(false);
    expect(countsStore.errorMessage()).toBeNull();
    httpTesting.expectNone(url);
  });

  it('should load counts once when a user signs in and share the result with the app', () => {
    fixture.detectChanges();

    const pending = signIn();

    expect(pending.request.method).toBe('GET');
    expect(pending.request.headers.get('Authorization')).toBe('Bearer token-a');
    expect(pending.request.params.keys()).toEqual([]);
    expect(countsStore.counts()).toBeNull();
    expect(countsStore.isLoading()).toBe(true);
    const counts = { sentRequests: 2, receivedRequests: 3, total: 5 };
    pending.flush(counts);
    fixture.detectChanges();
    expect(fixture.componentInstance.unreadMessageState).toBe(countsStore);
    expect(countsStore.counts()).toEqual(counts);
    expect(countsStore.isLoading()).toBe(false);
    httpTesting.expectNone(url);
  });

  it('should cancel the pending counts request and reset state after clicking logout', () => {
    const pending = signIn();

    fixture.nativeElement.querySelector('nav button').click();
    fixture.detectChanges();

    expect(authSessionStub.logout).toHaveBeenCalledTimes(1);
    expect(pending.cancelled).toBe(true);
    expect(countsStore.counts()).toBeNull();
    expect(countsStore.isLoading()).toBe(false);
    expect(countsStore.errorMessage()).toBeNull();
    expect(fixture.nativeElement.querySelector('.session-user')).toBeNull();
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledExactlyOnceWith(['/login']);
    httpTesting.expectNone(url);
  });

  it('should cancel an old account request and load the new account without retaining old counts', () => {
    const oldPending = signIn();

    const newPending = signIn(userB, 'token-b');

    expect(oldPending.cancelled).toBe(true);
    expect(newPending.request.headers.get('Authorization')).toBe('Bearer token-b');
    expect(countsStore.counts()).toBeNull();
    expect(countsStore.isLoading()).toBe(true);
    const counts = { sentRequests: 0, receivedRequests: 1, total: 1 };
    newPending.flush(counts);
    fixture.detectChanges();
    expect(countsStore.counts()).toEqual(counts);
    expect(fixture.nativeElement.querySelector('.session-user').textContent).toContain(
      'Bruno Leroy',
    );
    httpTesting.expectNone(url);
  });

  it('should preserve updated counts without restarting the session effect on a manual refresh', () => {
    signIn().flush({ sentRequests: 2, receivedRequests: 3, total: 5 });
    fixture.detectChanges();

    countsStore.refresh();
    const pending = httpTesting.expectOne(url);
    pending.flush({ sentRequests: 0, receivedRequests: 1, total: 1 });
    fixture.detectChanges();
    fixture.detectChanges();

    expect(countsStore.counts()).toEqual({ sentRequests: 0, receivedRequests: 1, total: 1 });
    expect(countsStore.isLoading()).toBe(false);
    httpTesting.expectNone(url);
  });

  it('should not track the interceptor token read as a session effect dependency', () => {
    const counts = { sentRequests: 2, receivedRequests: 3, total: 5 };
    signIn().flush(counts);
    fixture.detectChanges();

    authSessionStub.accessToken.set('replacement-token');
    fixture.detectChanges();

    expect(countsStore.counts()).toEqual(counts);
    httpTesting.expectNone(url);
  });

  it('should retain the account and update counts after transparent token renewal and one retry', () => {
    signIn().flush({ sentRequests: 1, receivedRequests: 0, total: 1 });
    fixture.detectChanges();
    authSessionStub.renewAccessToken.mockImplementation(() =>
      of('renewed-token').pipe(tap((token) => authSessionStub.accessToken.set(token))),
    );
    countsStore.refresh();
    const original = httpTesting.expectOne(url);

    original.flush(null, { status: 401, statusText: 'Unauthorized' });

    const retry = httpTesting.expectOne(url);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer renewed-token');
    expect(authSessionStub.currentUser()).toBe(userA);
    retry.flush({ sentRequests: 2, receivedRequests: 1, total: 3 });
    fixture.detectChanges();
    expect(countsStore.counts()).toEqual({ sentRequests: 2, receivedRequests: 1, total: 3 });
    expect(countsStore.isLoading()).toBe(false);
    expect(countsStore.errorMessage()).toBeNull();
    expect(authSessionStub.renewAccessToken).toHaveBeenCalledTimes(1);
    expect(authSessionStub.clearSession).not.toHaveBeenCalled();
    expect(authSessionStub.logout).not.toHaveBeenCalled();
    httpTesting.expectNone(url);
  });

  it('should reset counts when a 401 is followed by failed token renewal', () => {
    const pending = signIn();

    pending.flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
    fixture.detectChanges();

    expect(authSessionStub.clearSession).toHaveBeenCalledTimes(1);
    expect(authSessionStub.logout).not.toHaveBeenCalled();
    expect(authSessionStub.currentUser()).toBeNull();
    expect(countsStore.counts()).toBeNull();
    expect(countsStore.isLoading()).toBe(false);
    expect(countsStore.errorMessage()).toBeNull();
    httpTesting.expectNone(url);
  });

  it('should keep the authenticated session and allow manual retry after a server failure', () => {
    signIn().flush(
      { message: 'Server failure' },
      { status: 500, statusText: 'Internal Server Error' },
    );
    fixture.detectChanges();

    expect(authSessionStub.currentUser()).toEqual(userA);
    expect(authSessionStub.logout).not.toHaveBeenCalled();
    expect(authSessionStub.clearSession).not.toHaveBeenCalled();
    expect(countsStore.errorMessage()).toBe('Impossible de charger les compteurs de messages.');
    expect(countsStore.counts()).toBeNull();
    httpTesting.expectNone(url);
    countsStore.refresh();
    httpTesting.expectOne(url).flush({ sentRequests: 0, receivedRequests: 0, total: 0 });
    fixture.detectChanges();
    expect(countsStore.counts()).toEqual({ sentRequests: 0, receivedRequests: 0, total: 0 });
    expect(countsStore.errorMessage()).toBeNull();
    httpTesting.expectNone(url);
  });

  describe('unread count polling', () => {
    const emptyCounts = { sentRequests: 0, receivedRequests: 0, total: 0 };
    let visibility: DocumentVisibilityState;

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      visibility = 'visible';
      vi.spyOn(TestBed.inject(DOCUMENT), 'visibilityState', 'get').mockImplementation(
        () => visibility,
      );
    });

    afterEach(() => {
      fixture.destroy();
      vi.useRealTimers();
    });

    describe('page visibility', () => {
      it('should still load initial counts when signed in on a hidden page and skip periodic requests', () => {
        visibility = 'hidden';

        signIn().flush({ sentRequests: 2, receivedRequests: 1, total: 3 });
        fixture.detectChanges();
        vi.advanceTimersByTime(90_000);
        fixture.detectChanges();

        expect(countsStore.counts()).toEqual({ sentRequests: 2, receivedRequests: 1, total: 3 });
        expect(fixture.nativeElement.querySelectorAll('nav .unread-badge')).toHaveLength(2);
        expect(countsStore.isLoading()).toBe(false);
        httpTesting.expectNone(url);
      });

      it('should preserve loaded counts and skip every tick while the page is hidden', () => {
        signIn().flush({ sentRequests: 2, receivedRequests: 1, total: 3 });
        fixture.detectChanges();
        vi.advanceTimersByTime(10_000);

        visibility = 'hidden';
        TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
        vi.advanceTimersByTime(80_000);
        fixture.detectChanges();

        expect(countsStore.counts()).toEqual({ sentRequests: 2, receivedRequests: 1, total: 3 });
        expect(countsStore.errorMessage()).toBeNull();
        expect(fixture.nativeElement.querySelectorAll('nav .unread-badge')).toHaveLength(2);
        httpTesting.expectNone(url);
      });

      it('should refresh immediately when becoming visible and preserve the existing polling schedule', () => {
        signIn().flush(emptyCounts);
        fixture.detectChanges();
        visibility = 'hidden';
        vi.advanceTimersByTime(50_000);
        httpTesting.expectNone(url);

        visibility = 'visible';
        TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
        const returning = httpTesting.expectOne(url);
        expect(returning.request.method).toBe('GET');
        expect(returning.request.headers.get('Authorization')).toBe('Bearer token-a');
        returning.flush({ sentRequests: 0, receivedRequests: 1, total: 1 });
        fixture.detectChanges();
        expect(countsStore.counts()).toEqual({ sentRequests: 0, receivedRequests: 1, total: 1 });
        expect(fixture.nativeElement.querySelectorAll('nav .unread-badge')).toHaveLength(1);

        vi.advanceTimersByTime(9_999);
        httpTesting.expectNone(url);
        vi.advanceTimersByTime(1);
        httpTesting.expectOne(url).flush(emptyCounts);
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelectorAll('nav .unread-badge')).toHaveLength(0);
        vi.advanceTimersByTime(30_000);
        httpTesting.expectOne(url).flush(emptyCounts);
        httpTesting.expectNone(url);
      });

      it('should allow an in-flight poll to finish after the page becomes hidden without starting another', () => {
        signIn().flush(emptyCounts);
        fixture.detectChanges();
        vi.advanceTimersByTime(30_000);
        const pending = httpTesting.expectOne(url);

        visibility = 'hidden';
        TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
        vi.advanceTimersByTime(30_000);
        expect(pending.cancelled).toBe(false);
        httpTesting.expectNone(url);
        pending.flush({ sentRequests: 1, receivedRequests: 0, total: 1 });
        fixture.detectChanges();
        expect(countsStore.isLoading()).toBe(false);
        expect(countsStore.counts()).toEqual({ sentRequests: 1, receivedRequests: 0, total: 1 });
        vi.advanceTimersByTime(30_000);
        httpTesting.expectNone(url);
      });

      it('should wait for a pending refresh even after the page becomes visible again', () => {
        signIn().flush(emptyCounts);
        fixture.detectChanges();
        vi.advanceTimersByTime(30_000);
        const pending = httpTesting.expectOne(url);
        visibility = 'hidden';
        vi.advanceTimersByTime(30_000);

        visibility = 'visible';
        TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
        vi.advanceTimersByTime(30_000);
        expect(pending.cancelled).toBe(false);
        httpTesting.expectNone(url);
        pending.flush(emptyCounts);
        fixture.detectChanges();
        vi.advanceTimersByTime(30_000);
        httpTesting.expectOne(url).flush(emptyCounts);
      });

      it('should ignore visibility events while anonymous', () => {
        fixture.detectChanges();
        visibility = 'hidden';
        TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));

        visibility = 'visible';
        TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
        vi.advanceTimersByTime(90_000);

        expect(authSessionStub.currentUser()).toBeNull();
        expect(countsStore.counts()).toBeNull();
        httpTesting.expectNone(url);
      });

      it('should let a return-triggered request finish when the next periodic tick arrives', () => {
        signIn().flush(emptyCounts);
        fixture.detectChanges();
        visibility = 'hidden';
        vi.advanceTimersByTime(20_000);

        visibility = 'visible';
        TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
        const pending = httpTesting.expectOne(url);
        vi.advanceTimersByTime(10_000);
        fixture.detectChanges();
        expect(pending.cancelled).toBe(false);
        expect(countsStore.isLoading()).toBe(true);
        httpTesting.expectNone(url);

        pending.flush({ sentRequests: 2, receivedRequests: 0, total: 2 });
        fixture.detectChanges();
        vi.advanceTimersByTime(30_000);
        httpTesting.expectOne(url).flush(emptyCounts);
        httpTesting.expectNone(url);
      });

      it('should keep listening and allow another return-triggered refresh after a server error', () => {
        signIn().flush(emptyCounts);
        fixture.detectChanges();
        visibility = 'hidden';
        TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
        httpTesting.expectNone(url);
        visibility = 'visible';
        TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
        httpTesting
          .expectOne(url)
          .flush(
            { message: 'Server failure' },
            { status: 500, statusText: 'Internal Server Error' },
          );
        fixture.detectChanges();
        expect(countsStore.errorMessage()).toBe('Impossible de charger les compteurs de messages.');
        expect(authSessionStub.currentUser()).toEqual(userA);

        visibility = 'hidden';
        TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
        httpTesting.expectNone(url);
        visibility = 'visible';
        TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
        const retry = httpTesting.expectOne(url);
        expect(countsStore.errorMessage()).toBeNull();
        retry.flush({ sentRequests: 1, receivedRequests: 0, total: 1 });
        fixture.detectChanges();
        expect(countsStore.counts()).toEqual({ sentRequests: 1, receivedRequests: 0, total: 1 });
        httpTesting.expectNone(url);
      });

      it('should stop return-triggered refreshes and polling after token renewal fails', () => {
        signIn().flush(emptyCounts);
        fixture.detectChanges();
        visibility = 'hidden';
        TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
        visibility = 'visible';
        TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));

        httpTesting
          .expectOne(url)
          .flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
        fixture.detectChanges();
        visibility = 'hidden';
        TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
        visibility = 'visible';
        TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
        vi.advanceTimersByTime(90_000);

        expect(authSessionStub.clearSession).toHaveBeenCalledTimes(1);
        expect(authSessionStub.logout).not.toHaveBeenCalled();
        expect(authSessionStub.currentUser()).toBeNull();
        expect(countsStore.counts()).toBeNull();
        expect(countsStore.errorMessage()).toBeNull();
        httpTesting.expectNone(url);
      });

      it('should remove the previous account visibility listener and refresh only with the new token', () => {
        const document = TestBed.inject(DOCUMENT);
        const addListener = vi.spyOn(document, 'addEventListener');
        const removeListener = vi.spyOn(document, 'removeEventListener');
        signIn().flush(emptyCounts);
        fixture.detectChanges();
        const oldListeners = addListener.mock.calls.filter(
          ([event]) => event === 'visibilitychange',
        );
        expect(oldListeners).toHaveLength(1);
        const oldHandler = oldListeners[0][1];
        visibility = 'hidden';
        document.dispatchEvent(new Event('visibilitychange'));

        signIn(userB, 'token-b').flush(emptyCounts);
        fixture.detectChanges();

        expect(
          removeListener.mock.calls.some(
            ([event, handler]) => event === 'visibilitychange' && handler === oldHandler,
          ),
        ).toBe(true);
        expect(
          addListener.mock.calls.filter(([event]) => event === 'visibilitychange'),
        ).toHaveLength(2);
        visibility = 'visible';
        document.dispatchEvent(new Event('visibilitychange'));
        const returning = httpTesting.expectOne(url);
        expect(returning.request.headers.get('Authorization')).toBe('Bearer token-b');
        returning.flush({ sentRequests: 0, receivedRequests: 4, total: 4 });
        fixture.detectChanges();
        expect(countsStore.counts()).toEqual({ sentRequests: 0, receivedRequests: 4, total: 4 });
        expect(authSessionStub.currentUser()).toEqual(userB);
        httpTesting.expectNone(url);
      });

      it('should remove the visibility listener on App destruction and ignore later browser events', () => {
        const document = TestBed.inject(DOCUMENT);
        const addListener = vi.spyOn(document, 'addEventListener');
        const removeListener = vi.spyOn(document, 'removeEventListener');
        signIn().flush(emptyCounts);
        fixture.detectChanges();
        const listeners = addListener.mock.calls.filter(([event]) => event === 'visibilitychange');
        expect(listeners).toHaveLength(1);
        const handler = listeners[0][1];

        fixture.destroy();

        expect(
          removeListener.mock.calls.some(
            ([event, removed]) => event === 'visibilitychange' && removed === handler,
          ),
        ).toBe(true);
        visibility = 'hidden';
        document.dispatchEvent(new Event('visibilitychange'));
        visibility = 'visible';
        document.dispatchEvent(new Event('visibilitychange'));
        vi.advanceTimersByTime(90_000);
        expect(authSessionStub.currentUser()).toEqual(userA);
        httpTesting.expectNone(url);
      });

      it('should not restart polling when the page becomes visible after logout while hidden', () => {
        signIn().flush(emptyCounts);
        fixture.detectChanges();
        visibility = 'hidden';
        vi.advanceTimersByTime(10_000);

        fixture.nativeElement.querySelector('nav button').click();
        fixture.detectChanges();
        visibility = 'visible';
        TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
        vi.advanceTimersByTime(90_000);
        fixture.detectChanges();

        expect(authSessionStub.currentUser()).toBeNull();
        expect(countsStore.counts()).toBeNull();
        expect(fixture.nativeElement.querySelectorAll('nav .unread-badge')).toHaveLength(0);
        httpTesting.expectNone(url);
      });
    });

    it('should not start a polling request for anonymous visitors', () => {
      fixture.detectChanges();

      vi.advanceTimersByTime(90_000);
      fixture.detectChanges();

      httpTesting.expectNone(url);
      expect(countsStore.counts()).toBeNull();
    });

    it('should refresh at each 30-second boundary and update the header badges from the response', () => {
      signIn().flush(emptyCounts);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('nav .unread-badge')).toHaveLength(0);

      vi.advanceTimersByTime(29_999);
      httpTesting.expectNone(url);
      vi.advanceTimersByTime(1);
      const firstPoll = httpTesting.expectOne(url);
      expect(firstPoll.request.method).toBe('GET');
      expect(firstPoll.request.headers.get('Authorization')).toBe('Bearer token-a');
      firstPoll.flush({ sentRequests: 2, receivedRequests: 1, total: 3 });
      fixture.detectChanges();
      expect(countsStore.counts()).toEqual({ sentRequests: 2, receivedRequests: 1, total: 3 });
      expect(fixture.nativeElement.querySelectorAll('nav .unread-badge')).toHaveLength(2);

      vi.advanceTimersByTime(29_999);
      httpTesting.expectNone(url);
      vi.advanceTimersByTime(1);
      httpTesting.expectOne(url).flush(emptyCounts);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('nav .unread-badge')).toHaveLength(0);
      httpTesting.expectNone(url);
    });

    it('should leave a slow initial request pending and resume polling after it finishes', () => {
      const initial = signIn();

      vi.advanceTimersByTime(60_000);
      fixture.detectChanges();

      expect(initial.cancelled).toBe(false);
      expect(countsStore.isLoading()).toBe(true);
      httpTesting.expectNone(url);
      initial.flush(emptyCounts);
      fixture.detectChanges();
      vi.advanceTimersByTime(30_000);
      httpTesting.expectOne(url).flush(emptyCounts);
    });

    it('should skip polling ticks while a periodic request is pending without cancelling it', () => {
      signIn().flush(emptyCounts);
      fixture.detectChanges();
      vi.advanceTimersByTime(30_000);
      const pendingPoll = httpTesting.expectOne(url);

      vi.advanceTimersByTime(90_000);
      fixture.detectChanges();

      expect(pendingPoll.cancelled).toBe(false);
      httpTesting.expectNone(url);
      pendingPoll.flush({ sentRequests: 1, receivedRequests: 0, total: 1 });
      fixture.detectChanges();
      vi.advanceTimersByTime(30_000);
      httpTesting.expectOne(url).flush(emptyCounts);
    });

    it('should retry at the next tick after a server error and keep the session authenticated', () => {
      signIn().flush(emptyCounts);
      fixture.detectChanges();
      vi.advanceTimersByTime(30_000);
      httpTesting
        .expectOne(url)
        .flush({ message: 'Server failure' }, { status: 500, statusText: 'Internal Server Error' });
      fixture.detectChanges();
      expect(countsStore.errorMessage()).toBe('Impossible de charger les compteurs de messages.');
      expect(authSessionStub.currentUser()).toEqual(userA);
      expect(authSessionStub.logout).not.toHaveBeenCalled();
      expect(authSessionStub.clearSession).not.toHaveBeenCalled();

      vi.advanceTimersByTime(30_000);
      const retry = httpTesting.expectOne(url);
      expect(countsStore.errorMessage()).toBeNull();
      retry.flush({ sentRequests: 0, receivedRequests: 1, total: 1 });
      fixture.detectChanges();
      expect(countsStore.counts()).toEqual({ sentRequests: 0, receivedRequests: 1, total: 1 });
      httpTesting.expectNone(url);
    });

    it('should keep one polling schedule and wait for a manual refresh that crosses a tick', () => {
      signIn().flush(emptyCounts);
      fixture.detectChanges();
      vi.advanceTimersByTime(10_000);
      countsStore.refresh();
      const manualRefresh = httpTesting.expectOne(url);

      vi.advanceTimersByTime(20_000);
      fixture.detectChanges();

      expect(manualRefresh.cancelled).toBe(false);
      httpTesting.expectNone(url);
      manualRefresh.flush({ sentRequests: 2, receivedRequests: 0, total: 2 });
      fixture.detectChanges();
      vi.advanceTimersByTime(29_999);
      httpTesting.expectNone(url);
      vi.advanceTimersByTime(1);
      httpTesting.expectOne(url).flush(emptyCounts);
      fixture.detectChanges();
      httpTesting.expectNone(url);
    });

    it('should cancel a pending poll and stop subsequent ticks after manual logout', () => {
      signIn().flush(emptyCounts);
      fixture.detectChanges();
      vi.advanceTimersByTime(30_000);
      const pendingPoll = httpTesting.expectOne(url);

      fixture.nativeElement.querySelector('nav button').click();
      fixture.detectChanges();
      vi.advanceTimersByTime(90_000);
      fixture.detectChanges();

      expect(pendingPoll.cancelled).toBe(true);
      expect(countsStore.counts()).toBeNull();
      expect(countsStore.isLoading()).toBe(false);
      expect(authSessionStub.currentUser()).toBeNull();
      httpTesting.expectNone(url);
    });

    it('should replace the previous account schedule with a fresh one using the new token', () => {
      signIn().flush(emptyCounts);
      fixture.detectChanges();
      vi.advanceTimersByTime(10_000);
      signIn(userB, 'token-b').flush(emptyCounts);
      fixture.detectChanges();

      vi.advanceTimersByTime(20_000);
      httpTesting.expectNone(url);
      vi.advanceTimersByTime(9_999);
      httpTesting.expectNone(url);
      vi.advanceTimersByTime(1);
      const newPoll = httpTesting.expectOne(url);
      expect(newPoll.request.headers.get('Authorization')).toBe('Bearer token-b');
      newPoll.flush({ sentRequests: 0, receivedRequests: 4, total: 4 });
      fixture.detectChanges();
      vi.advanceTimersByTime(30_000);
      httpTesting.expectOne(url).flush(emptyCounts);
      expect(authSessionStub.currentUser()).toEqual(userB);
      httpTesting.expectNone(url);
    });

    it('should stop polling after an expired token cannot be renewed', () => {
      signIn().flush(emptyCounts);
      fixture.detectChanges();
      vi.advanceTimersByTime(30_000);

      httpTesting
        .expectOne(url)
        .flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
      fixture.detectChanges();
      vi.advanceTimersByTime(90_000);
      fixture.detectChanges();

      expect(authSessionStub.clearSession).toHaveBeenCalledTimes(1);
      expect(authSessionStub.logout).not.toHaveBeenCalled();
      expect(authSessionStub.currentUser()).toBeNull();
      expect(countsStore.counts()).toBeNull();
      expect(countsStore.errorMessage()).toBeNull();
      httpTesting.expectNone(url);
    });

    it('should stop its timer when App is destroyed even while the account remains signed in', () => {
      signIn().flush(emptyCounts);
      fixture.detectChanges();
      vi.advanceTimersByTime(29_999);

      fixture.destroy();
      vi.advanceTimersByTime(90_000);

      expect(authSessionStub.currentUser()).toEqual(userA);
      httpTesting.expectNone(url);
    });
  });

  describe('unread badges in the header', () => {
    function badge(direction: 'sent' | 'received') {
      return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
        `nav a[href="/service-requests/${direction}"] .unread-badge`,
      );
    }

    it('should hide badges while the initial counts are unknown', () => {
      const pending = signIn();

      expect(countsStore.isLoading()).toBe(true);
      expect(badge('sent')).toBeNull();
      expect(badge('received')).toBeNull();
      pending.flush({ sentRequests: 0, receivedRequests: 0, total: 0 });
    });

    it.each([
      { sentRequests: 0, receivedRequests: 0, total: 0 },
      { sentRequests: 2, receivedRequests: 0, total: 2 },
      { sentRequests: 0, receivedRequests: 3, total: 3 },
    ])(
      'should show only positive counters for sent=$sentRequests and received=$receivedRequests',
      (counts) => {
        signIn().flush(counts);
        fixture.detectChanges();

        for (const [direction, count] of [
          ['sent', counts.sentRequests],
          ['received', counts.receivedRequests],
        ] as const) {
          if (count === 0) {
            expect(badge(direction)).toBeNull();
          } else {
            expect(badge(direction)?.textContent?.trim()).toBe(String(count));
            expect(badge(direction)?.getAttribute('aria-label')).toBe(`${count} messages non lus`);
          }
        }
        httpTesting.expectNone(url);
      },
    );

    it('should display each count beside its request link with a description for assistive technology', () => {
      signIn().flush({ sentRequests: 12, receivedRequests: 103, total: 115 });
      fixture.detectChanges();

      expect(badge('sent')?.textContent?.trim()).toBe('12');
      expect(badge('sent')?.getAttribute('aria-label')).toBe('12 messages non lus');
      expect(badge('received')?.textContent?.trim()).toBe('103');
      expect(badge('received')?.getAttribute('aria-label')).toBe('103 messages non lus');
      expect(badge('sent')?.parentElement?.textContent).toContain('Demandes envoyées');
      expect(badge('received')?.parentElement?.textContent).toContain('Demandes reçues');
      expect(fixture.nativeElement.querySelectorAll('nav .unread-badge')).toHaveLength(2);
      httpTesting.expectNone(url);
    });

    it('should update badges from shared counts and remove a counter when it reaches zero', () => {
      signIn().flush({ sentRequests: 2, receivedRequests: 3, total: 5 });
      fixture.detectChanges();
      expect(badge('sent')?.textContent?.trim()).toBe('2');
      expect(badge('received')?.textContent?.trim()).toBe('3');

      countsStore.refresh();
      const pending = httpTesting.expectOne(url);
      fixture.detectChanges();
      expect(badge('sent')?.textContent?.trim()).toBe('2');
      expect(badge('received')?.textContent?.trim()).toBe('3');

      pending.flush({ sentRequests: 0, receivedRequests: 1, total: 1 });
      fixture.detectChanges();
      expect(badge('sent')).toBeNull();
      expect(badge('received')?.textContent?.trim()).toBe('1');
      httpTesting.expectNone(url);
    });

    it('should remove loaded badges when the user logs out', () => {
      signIn().flush({ sentRequests: 2, receivedRequests: 3, total: 5 });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('nav .unread-badge')).toHaveLength(2);

      fixture.nativeElement.querySelector('nav button').click();
      fixture.detectChanges();

      expect(fixture.nativeElement.querySelectorAll('nav .unread-badge')).toHaveLength(0);
      expect(countsStore.counts()).toBeNull();
      httpTesting.expectNone(url);
    });

    it('should clear the previous account badges before displaying the new account counts', () => {
      signIn().flush({ sentRequests: 2, receivedRequests: 3, total: 5 });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('nav .unread-badge')).toHaveLength(2);

      const pending = signIn(userB, 'token-b');
      expect(badge('sent')).toBeNull();
      expect(badge('received')).toBeNull();
      expect(countsStore.counts()).toBeNull();

      pending.flush({ sentRequests: 0, receivedRequests: 4, total: 4 });
      fixture.detectChanges();
      expect(badge('sent')).toBeNull();
      expect(badge('received')?.textContent?.trim()).toBe('4');
      expect(fixture.nativeElement.querySelector('.session-user').textContent).toContain(
        'Bruno Leroy',
      );
      httpTesting.expectNone(url);
    });
  });
});
