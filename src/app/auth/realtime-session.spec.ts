import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { Socket } from 'socket.io-client';
import { App } from '../app';
import { routes } from '../app.routes';
import { AuthSession } from './services/auth-session';
import { authInterceptor } from './interceptors/auth-interceptor';

// Real App, session, HTTP store, interceptor and Socket.IO client. Only transport is simulated.
describe('Realtime authentication recovery integration', () => {
  const authUrl = 'http://localhost:3000/auth';
  const requestsUrl = 'http://localhost:3000/service-requests/sent';
  const countsUrl = 'http://localhost:3000/service-requests/messages/unread-counts';
  const credentials = { email: 'alice@example.test', password: 'test-only-password' };
  const user = { id: 7, firstName: 'Alice', lastName: 'Martin', email: credentials.email };
  const emptyCounts = { sentRequests: 0, receivedRequests: 0, total: 0 };
  let fixture: ComponentFixture<App>;
  let session: InstanceType<typeof AuthSession>;
  let http: HttpTestingController;
  let client: HttpClient;
  let sockets: Socket[];

  beforeEach(async () => {
    sockets = [];
    vi.spyOn(Socket.prototype, 'connect').mockImplementation(function (this: Socket) {
      sockets.push(this);
      return this;
    });
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    session = TestBed.inject(AuthSession);
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
    session.login(credentials);
    http.expectOne(`${authUrl}/login`).flush({ accessToken: 'original-token' });
    http.expectOne(`${authUrl}/me`).flush(user);
    fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    http.expectOne(countsUrl).flush(emptyCounts);
    expect(sockets).toHaveLength(1);
    expect(sockets[0].auth).toEqual({ accessToken: 'original-token' });
  });

  afterEach(() => {
    fixture.destroy();
    http.verify();
    vi.restoreAllMocks();
  });

  function receive(event: string, value?: unknown, socket = sockets.at(-1)!) {
    for (const listener of socket.listeners(event)) listener(value);
  }

  function expectRefresh() {
    const refresh = http.expectOne(`${authUrl}/refresh`);
    expect(refresh.request.method).toBe('POST');
    expect(refresh.request.withCredentials).toBe(true);
    expect(refresh.request.headers.has('Authorization')).toBe(false);
    return refresh;
  }

  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it.each(['disconnect', 'connect_error'] as const)(
    'should renew through the refresh cookie and reconnect after an authentication %s',
    (event) => {
      receive(event, event === 'disconnect' ? 'io server disconnect' : new Error('Unauthorized'));
      expectRefresh().flush({ accessToken: 'renewed-token' });
      fixture.detectChanges();
      expect(sockets).toHaveLength(2);
      expect(sockets[1].auth).toEqual({ accessToken: 'renewed-token' });
      expect(sockets[0].listeners('disconnect')).toHaveLength(0);
      expect(session.currentUser()).toEqual(user);
      expect(session.reauthenticationRequired()).toBe(false);
      http.expectNone(`${authUrl}/me`);
      receive('connect');
      const counts = http.expectOne(countsUrl);
      expect(counts.request.headers.get('Authorization')).toBe('Bearer renewed-token');
      counts.flush(emptyCounts);
    },
  );

  it('should leave ordinary transport failures to automatic Socket.IO reconnection', () => {
    receive('disconnect', 'transport close');
    receive('connect_error', new Error('websocket error'));
    http.expectNone(`${authUrl}/refresh`);
    expect(session.accessToken()).toBe('original-token');
    expect(session.isAuthenticated()).toBe(true);
  });

  it.each(['socket', 'http'] as const)(
    'should share one renewal with concurrent HTTP 401s when recovery starts from %s',
    (first) => {
      const next = vi.fn();
      if (first === 'socket') receive('disconnect', 'io server disconnect');
      client.get(requestsUrl).subscribe(next);
      http.expectOne(requestsUrl).flush(null, { status: 401, statusText: 'Unauthorized' });
      receive('disconnect', 'io server disconnect');
      receive('connect_error', new Error('Unauthorized'));
      const refresh = expectRefresh();
      http.expectNone(`${authUrl}/refresh`);
      refresh.flush({ accessToken: 'shared-token' });
      const retry = http.expectOne(requestsUrl);
      expect(retry.request.headers.get('Authorization')).toBe('Bearer shared-token');
      retry.flush([]);
      fixture.detectChanges();
      expect(next).toHaveBeenCalledExactlyOnceWith([]);
      expect(sockets).toHaveLength(2);
      expect(sockets[1].auth).toEqual({ accessToken: 'shared-token' });
      expect(session.reauthenticationRequired()).toBe(false);
    },
  );

  it.each([0, 401, 500])(
    'should request login after refresh failure with HTTP %s',
    async (status) => {
      const destination = '/service-requests/sent?filter=pending#latest';
      const router = TestBed.inject(Router);
      await router.navigateByUrl(destination);
      fixture.detectChanges();
      http.expectOne(requestsUrl).flush([]);
      receive('disconnect', 'io server disconnect');
      const refresh = expectRefresh();
      if (status === 0) refresh.error(new ProgressEvent('error'));
      else refresh.flush(null, { status, statusText: 'Refresh failed' });
      await settle();
      expect(session.isAuthenticated()).toBe(false);
      expect(session.reauthenticationRequired()).toBe(true);
      const loginUrl = router.parseUrl(router.url);
      expect(loginUrl.root.children['primary'].segments[0].path).toBe('login');
      expect(loginUrl.queryParams['returnUrl']).toBe(destination);
      expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain(
        'Votre session ne peut plus être utilisée.',
      );
      http.expectNone(`${authUrl}/logout`);
      expect(sockets).toHaveLength(1);
    },
  );

  it.each(['original-token', 'renewed-token'])(
    'should stop a repeated refusal after renewal returns %s instead of looping',
    async (token) => {
      receive('disconnect', 'io server disconnect');
      expectRefresh().flush({ accessToken: token });
      fixture.detectChanges();
      expect(sockets).toHaveLength(2);
      expect(sockets[1].auth).toEqual({ accessToken: token });
      receive('connect_error', new Error('Unauthorized'));
      await settle();
      http.expectNone(`${authUrl}/refresh`);
      expect(session.reauthenticationRequired()).toBe(true);
      expect(session.isAuthenticated()).toBe(false);
      expect(sockets).toHaveLength(2);
    },
  );

  it('should reset the attempt limit after successful reconnection and recover at the next expiration', () => {
    receive('disconnect', 'io server disconnect');
    expectRefresh().flush({ accessToken: 'first-renewed-token' });
    fixture.detectChanges();
    receive('connect');
    http.expectOne(countsUrl).flush(emptyCounts);
    receive('disconnect', 'io server disconnect');
    expectRefresh().flush({ accessToken: 'second-renewed-token' });
    fixture.detectChanges();
    expect(sockets).toHaveLength(3);
    expect(sockets[2].auth).toEqual({ accessToken: 'second-renewed-token' });
    expect(session.reauthenticationRequired()).toBe(false);
  });

  it('should cancel pending recovery on manual logout and detach all old-socket listeners', async () => {
    receive('disconnect', 'io server disconnect');
    const refresh = expectRefresh();
    fixture.componentInstance.onLogout();
    expect(refresh.cancelled).toBe(true);
    http.expectOne(`${authUrl}/logout`).flush(null, { status: 204, statusText: 'No Content' });
    await settle();
    expect(sockets[0].listeners('disconnect')).toHaveLength(0);
    receive('disconnect', 'io server disconnect', sockets[0]);
    http.expectNone(`${authUrl}/refresh`);
    expect(session.reauthenticationRequired()).toBe(false);
    expect(session.isAuthenticated()).toBe(false);
  });

  it('should cancel an unshared pending recovery when App is destroyed', () => {
    receive('disconnect', 'io server disconnect');
    const refresh = expectRefresh();
    fixture.destroy();
    expect(refresh.cancelled).toBe(true);
    expect(sockets[0].listeners('disconnect')).toHaveLength(0);
    expect(session.accessToken()).toBe('original-token');
    expect(session.reauthenticationRequired()).toBe(false);
  });

  it('should cancel old recovery before a new account logs in', () => {
    receive('disconnect', 'io server disconnect');
    const refresh = expectRefresh();
    const bruno = { id: 9, firstName: 'Bruno', lastName: 'Leroy', email: 'bruno@example.test' };
    session.login({ ...credentials, email: bruno.email });
    expect(refresh.cancelled).toBe(true);
    http.expectOne(`${authUrl}/login`).flush({ accessToken: 'bruno-token' });
    http.expectOne(`${authUrl}/me`).flush(bruno);
    fixture.detectChanges();
    http.expectOne(countsUrl).flush(emptyCounts);
    expect(session.currentUser()).toEqual(bruno);
    expect(session.accessToken()).toBe('bruno-token');
    expect(sockets).toHaveLength(2);
    expect(sockets[1].auth).toEqual({ accessToken: 'bruno-token' });
    expect(session.reauthenticationRequired()).toBe(false);
  });
});
