import { ApplicationInitStatus } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { appConfig } from './app.config';
import { AuthSession } from './auth/services/auth-session';
import { LoginForm } from './auth/components/login-form/login-form';
import { ServiceRequestList } from './service-requests/components/service-request-list/service-request-list';

// Exercise the production providers rather than registering a separate test initializer.
describe('Application session initialization', () => {
  const url = 'http://localhost:3000/auth';
  const sentUrl = 'http://localhost:3000/service-requests/sent';
  const user = { id: 7, firstName: 'Alice', lastName: 'Martin', email: 'alice@example.test' };
  let http: HttpTestingController | undefined;

  function configure() {
    TestBed.configureTestingModule({
      providers: [...appConfig.providers, provideHttpClientTesting()],
    });
  }

  function start() {
    // TestBed runs the actual application initializers when its injector is created.
    const status = TestBed.inject(ApplicationInitStatus);
    http = TestBed.inject(HttpTestingController);
    return { status, http, session: TestBed.inject(AuthSession) };
  }

  beforeEach(() => {
    http = undefined;
    configure();
  });

  afterEach(() => {
    http?.verify();
  });

  it('should wait for the restored profile before completing initialization and opening a protected URL', async () => {
    const app = start();
    expect(app.status.done).toBe(false);
    const refresh = app.http.expectOne(`${url}/refresh`);
    expect(refresh.request.method).toBe('POST');
    expect(refresh.request.withCredentials).toBe(true);
    expect(refresh.request.headers.has('Authorization')).toBe(false);
    refresh.flush({ accessToken: 'restored-token' });
    const profile = app.http.expectOne(`${url}/me`);
    expect(profile.request.headers.get('Authorization')).toBe('Bearer restored-token');
    expect(app.status.done).toBe(false);
    expect(app.session.isAuthenticated()).toBe(false);
    profile.flush(user);
    await app.status.donePromise;

    expect(app.status.done).toBe(true);
    expect(app.session.isLoading()).toBe(false);
    expect(app.session.currentUser()).toEqual(user);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/service-requests/sent', ServiceRequestList);
    expect(TestBed.inject(Router).url).toBe('/service-requests/sent');
    const sent = app.http.expectOne(sentUrl);
    expect(sent.request.headers.get('Authorization')).toBe('Bearer restored-token');
    sent.flush([]);
    app.http.expectNone(`${url}/logout`);
  });

  it.each(['refresh', 'profile'])(
    'should initialize anonymously and redirect a protected URL after a %s 401',
    async (phase) => {
      const app = start();
      const refresh = app.http.expectOne(`${url}/refresh`);
      if (phase === 'refresh') {
        refresh.flush(
          { message: 'Invalid refresh session' },
          { status: 401, statusText: 'Unauthorized' },
        );
      } else {
        refresh.flush({ accessToken: 'restored-token' });
        app.http
          .expectOne(`${url}/me`)
          .flush({ message: 'Invalid user' }, { status: 401, statusText: 'Unauthorized' });
      }
      await app.status.donePromise;

      expect(app.status.done).toBe(true);
      expect(app.session.isAuthenticated()).toBe(false);
      expect(app.session.isLoading()).toBe(false);
      expect(app.session.errorMessage()).toBeNull();
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl('/service-requests/sent', LoginForm);
      expect(TestBed.inject(Router).url).toBe('/login');
      app.http.expectNone(sentUrl);
      app.http.expectNone(`${url}/logout`);
    },
  );

  it('should complete initialization after a server failure and display the restoration error on login', async () => {
    const app = start();
    app.http
      .expectOne(`${url}/refresh`)
      .flush({ message: 'Unavailable' }, { status: 500, statusText: 'Internal Server Error' });
    await app.status.donePromise;

    expect(app.status.done).toBe(true);
    expect(app.session.isAuthenticated()).toBe(false);
    expect(app.session.isLoading()).toBe(false);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/service-requests/sent', LoginForm);
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('[role="alert"]')?.textContent).toContain(
      'Impossible de restaurer la session. Veuillez réessayer.',
    );
    app.http.expectNone(sentUrl);
    app.http.expectNone(`${url}/logout`);
  });

  it('should complete initialization after the ten-second restoration timeout', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    try {
      const app = start();
      const pending = app.http.expectOne(`${url}/refresh`);
      expect(app.status.done).toBe(false);
      vi.advanceTimersByTime(9999);
      expect(app.status.done).toBe(false);
      expect(pending.cancelled).toBe(false);
      vi.advanceTimersByTime(1);
      await app.status.donePromise;

      expect(pending.cancelled).toBe(true);
      expect(app.status.done).toBe(true);
      expect(app.session.isLoading()).toBe(false);
      expect(app.session.isAuthenticated()).toBe(false);
      expect(app.session.errorMessage()).toBe(
        'Impossible de restaurer la session. Veuillez réessayer.',
      );
      app.http.expectNone(`${url}/logout`);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should start anonymously in a fresh application after logout and a rejected refresh cookie', async () => {
    const first = start();
    first.http.expectOne(`${url}/refresh`).flush({ accessToken: 'restored-token' });
    first.http.expectOne(`${url}/me`).flush(user);
    await first.status.donePromise;
    first.session.logout();
    const logout = first.http.expectOne(`${url}/logout`);
    expect(logout.request.withCredentials).toBe(true);
    logout.flush(null, { status: 204, statusText: 'No Content' });
    expect(first.session.isAuthenticated()).toBe(false);
    first.http.verify();

    TestBed.resetTestingModule();
    configure();
    const reloaded = start();
    expect(reloaded.session).not.toBe(first.session);
    reloaded.http
      .expectOne(`${url}/refresh`)
      .flush({ message: 'Invalid refresh session' }, { status: 401, statusText: 'Unauthorized' });
    await reloaded.status.donePromise;
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/service-requests/sent', LoginForm);

    expect(reloaded.session.isAuthenticated()).toBe(false);
    expect(TestBed.inject(Router).url).toBe('/login');
    reloaded.http.expectNone(sentUrl);
  });
});
