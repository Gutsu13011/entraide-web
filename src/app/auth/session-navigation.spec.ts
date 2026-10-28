import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { By } from '@angular/platform-browser';
import { App } from '../app';
import { routes } from '../app.routes';
import { AuthSession } from './services/auth-session';
import { authInterceptor } from './interceptors/auth-interceptor';
import { LoginForm } from './components/login-form/login-form';
import { Subject } from 'rxjs';
import { ServiceRequestRealtime } from '../service-requests/services/service-request-realtime';

// Use the real root component, auth store, interceptor, guard and login form.
describe('Application reauthentication navigation', () => {
  const realtime = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    conversationChanged$: new Subject<{ serviceRequestId: number }>().asObservable(),
  };
  const authUrl = 'http://localhost:3000/auth';
  const requestsUrl = 'http://localhost:3000/service-requests/sent';
  const countsUrl = 'http://localhost:3000/service-requests/messages/unread-counts';
  const destination = '/service-requests/sent?filter=pending&search=Alice%20Martin#latest';
  const credentials = { email: 'alice@example.test', password: 'test-only-password' };
  const user = { id: 7, firstName: 'Alice', lastName: 'Martin', email: credentials.email };
  const emptyCounts = { sentRequests: 0, receivedRequests: 0, total: 0 };
  const message = 'Votre session ne peut plus être utilisée. Veuillez vous reconnecter.';
  let fixture: ComponentFixture<App>;
  let session: InstanceType<typeof AuthSession>;
  let router: Router;
  let http: HttpTestingController;
  let client: HttpClient;

  beforeEach(async () => {
    realtime.conversationChanged$ = new Subject<{ serviceRequestId: number }>().asObservable();
    realtime.connect.mockReset();
    realtime.disconnect.mockReset();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        { provide: ServiceRequestRealtime, useValue: realtime },
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    session = TestBed.inject(AuthSession);
    router = TestBed.inject(Router);
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
    session.login(credentials);
    http.expectOne(`${authUrl}/login`).flush({ accessToken: 'original-token' });
    http.expectOne(`${authUrl}/me`).flush(user);
    fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    http.expectOne(countsUrl).flush(emptyCounts);
    expect(realtime.connect).toHaveBeenCalledExactlyOnceWith('original-token');
  });

  afterEach(() => {
    fixture.destroy();
    http.verify();
    vi.restoreAllMocks();
  });

  async function settleNavigation() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function openPrivatePage() {
    await router.navigateByUrl(destination);
    fixture.detectChanges();
    http.expectOne(requestsUrl).flush([]);
    fixture.detectChanges();
  }

  function rejectRequest() {
    const error = vi.fn();
    client.get(requestsUrl).subscribe({ error });
    http.expectOne(requestsUrl).flush(null, { status: 401, statusText: 'Unauthorized' });
    return error;
  }

  function expectLoginDestination() {
    const login = router.parseUrl(router.url);
    expect(login.root.children['primary'].segments.map((segment) => segment.path)).toEqual([
      'login',
    ]);
    expect(login.queryParams['returnUrl']).toBe(destination);
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(message);
    expect(session.reauthenticationRequired()).toBe(true);
    expect(session.isAuthenticated()).toBe(false);
    http.expectNone(`${authUrl}/logout`);
    expect(realtime.disconnect).toHaveBeenCalledOnce();
  }

  it('should redirect after renewal failure, keep the destination after failed login and return there after retry', async () => {
    await openPrivatePage();
    const navigate = vi.spyOn(router, 'navigate');
    const error = rejectRequest();
    http.expectOne(`${authUrl}/refresh`).flush(null, { status: 401, statusText: 'Unauthorized' });

    await settleNavigation();

    expectLoginDestination();
    expect(error).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: 401 }));
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/login'], {
      queryParams: { returnUrl: destination },
      replaceUrl: true,
    });
    expect(fixture.nativeElement.querySelector('main .service-request')).toBeNull();
    const login = fixture.debugElement.query(By.directive(LoginForm))
      .componentInstance as LoginForm;
    login.loginForm.setValue(credentials);
    login.onSubmit();
    expect(session.reauthenticationRequired()).toBe(false);
    http.expectOne(`${authUrl}/login`).flush(null, { status: 401, statusText: 'Unauthorized' });
    await settleNavigation();
    expect(router.parseUrl(router.url).queryParams['returnUrl']).toBe(destination);
    expect(session.isAuthenticated()).toBe(false);
    expect(session.errorMessage()).toBe('Connexion impossible. Veuillez réessayer.');
    expect(navigate).toHaveBeenCalledTimes(1);
    login.onSubmit();
    http.expectOne(`${authUrl}/login`).flush({ accessToken: 'new-login-token' });
    http.expectOne(`${authUrl}/me`).flush({ ...user });

    await settleNavigation();

    expect(router.url).toBe(destination);
    expect(session.isAuthenticated()).toBe(true);
    expect(session.errorMessage()).toBeNull();
    const requests = http.expectOne(requestsUrl);
    expect(requests.request.headers.get('Authorization')).toBe('Bearer new-login-token');
    requests.flush([]);
    const counts = http.expectOne(countsUrl);
    expect(counts.request.headers.get('Authorization')).toBe('Bearer new-login-token');
    counts.flush(emptyCounts);
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('should share failed renewal and navigate to login only once for concurrent 401s', async () => {
    await openPrivatePage();
    const navigate = vi.spyOn(router, 'navigate');
    const requireLogin = vi.spyOn(session, 'requiredReauthentication');
    const errors = [vi.fn(), vi.fn()];
    client.get(requestsUrl).subscribe({ error: errors[0] });
    client.get(countsUrl).subscribe({ error: errors[1] });
    http.expectOne(requestsUrl).flush(null, { status: 401, statusText: 'Unauthorized' });
    http.expectOne(countsUrl).flush(null, { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${authUrl}/refresh`).flush(null, { status: 401, statusText: 'Unauthorized' });

    await settleNavigation();

    expectLoginDestination();
    expect(requireLogin).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledTimes(1);
    for (const error of errors) expect(error).toHaveBeenCalledTimes(1);
    http.expectNone(`${authUrl}/refresh`);
    http.expectNone(requestsUrl);
    http.expectNone(countsUrl);
  });

  it('should request reauthentication after a renewed request is still rejected with 401', async () => {
    await openPrivatePage();
    const error = rejectRequest();
    http.expectOne(`${authUrl}/refresh`).flush({ accessToken: 'renewed-token' });
    const retry = http.expectOne(requestsUrl);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer renewed-token');
    retry.flush(null, { status: 401, statusText: 'Unauthorized' });

    await settleNavigation();

    expectLoginDestination();
    expect(error).toHaveBeenCalledTimes(1);
    http.expectNone(`${authUrl}/refresh`);
  });

  it('should stay on the current page after successful renewal without requesting reauthentication', async () => {
    await openPrivatePage();
    const navigate = vi.spyOn(router, 'navigate');
    const next = vi.fn();
    client.get(requestsUrl).subscribe(next);
    http.expectOne(requestsUrl).flush(null, { status: 401, statusText: 'Unauthorized' });
    http.expectOne(`${authUrl}/refresh`).flush({ accessToken: 'renewed-token' });
    http.expectOne(requestsUrl).flush([]);

    await settleNavigation();

    expect(next).toHaveBeenCalledExactlyOnceWith([]);
    expect(router.url).toBe(destination);
    expect(session.reauthenticationRequired()).toBe(false);
    expect(session.isAuthenticated()).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
    expect(realtime.disconnect).toHaveBeenCalledOnce();
    expect(realtime.connect.mock.calls).toEqual([['original-token'], ['renewed-token']]);
    http.expectNone(countsUrl);
  });

  it('should keep manual logout distinct from expired-session navigation', async () => {
    await openPrivatePage();
    const navigate = vi.spyOn(router, 'navigate');
    fixture.componentInstance.onLogout();
    http.expectOne(`${authUrl}/logout`).flush(null, { status: 204, statusText: 'No Content' });

    await settleNavigation();

    expect(router.url).toBe('/login');
    expect(realtime.disconnect).toHaveBeenCalledOnce();
    expect(realtime.connect).toHaveBeenCalledOnce();
    expect(session.reauthenticationRequired()).toBe(false);
    expect(session.errorMessage()).toBeNull();
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/login']);
    http.expectNone(`${authUrl}/refresh`);
  });

  it.each(['login', 'register'])(
    'should keep an existing %s URL when reauthentication is requested there',
    async (page) => {
      session.clearSession();
      await settleNavigation();
      const currentUrl = `/${page}?returnUrl=%2Fservice-requests%2Freceived`;
      await router.navigateByUrl(currentUrl);
      fixture.detectChanges();
      const navigate = vi.spyOn(router, 'navigate');

      session.requiredReauthentication();
      await settleNavigation();

      expect(router.url).toBe(currentUrl);
      expect(session.reauthenticationRequired()).toBe(true);
      expect(navigate).not.toHaveBeenCalled();
      http.expectNone(`${authUrl}/logout`);
    },
  );

  it('should leave the ordinary anonymous guard redirect free of an expired-session message', async () => {
    session.clearSession();
    await settleNavigation();
    const navigate = vi.spyOn(router, 'navigate');
    await router.navigateByUrl(destination);
    await settleNavigation();

    expect(router.parseUrl(router.url).queryParams['returnUrl']).toBe(destination);
    expect(session.reauthenticationRequired()).toBe(false);
    expect(session.errorMessage()).toBeNull();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    http.expectNone(requestsUrl);
  });
});
