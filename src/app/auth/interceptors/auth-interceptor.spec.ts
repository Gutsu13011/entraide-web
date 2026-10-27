import { TestBed } from '@angular/core/testing';
import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { authInterceptor } from './auth-interceptor';
import { signal } from '@angular/core';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthSession } from '../services/auth-session';
import { of, Subject, tap, throwError, TimeoutError } from 'rxjs';
import type { CurrentUserResponse } from '../../models/auth.model';

describe('authInterceptor', () => {
  const user: CurrentUserResponse = {
    id: 7,
    firstName: 'Alice',
    lastName: 'Martin',
    email: 'alice@example.test',
  };
  const authSessionStub = {
    accessToken: signal<string | null>('fake-token'),
    currentUser: signal<CurrentUserResponse | null>(user),
    renewAccessToken: vi.fn(),
    requiredReauthentication: vi.fn(),
    clearSession: vi.fn(),
    reauthenticationRequired: signal(false),
    logout: vi.fn(),
  };

  let http: HttpClient;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    authSessionStub.accessToken.set('fake-token');
    authSessionStub.currentUser.set(user);
    authSessionStub.reauthenticationRequired.set(false);
    authSessionStub.clearSession.mockReset();
    authSessionStub.renewAccessToken
      .mockReset()
      .mockImplementation(() =>
        throwError(
          () => new HttpErrorResponse({ status: 401, error: { message: 'Unauthorized' } }),
        ),
      );
    authSessionStub.logout.mockReset();
    authSessionStub.requiredReauthentication.mockReset().mockImplementation(() => {
      authSessionStub.accessToken.set(null);
      authSessionStub.currentUser.set(null);
      authSessionStub.reauthenticationRequired.set(true);
    });

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthSession, useValue: authSessionStub },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
    expect(authSessionStub.logout).not.toHaveBeenCalled();
    expect(authSessionStub.clearSession).not.toHaveBeenCalled();
  });

  it('should add a bearer token to requests targeting the API', () => {
    http.get('http://localhost:3000/service-providers').subscribe();

    const request = httpTesting.expectOne('http://localhost:3000/service-providers');

    expect(request.request.headers.get('Authorization')).toBe(
      `Bearer ${authSessionStub.accessToken()}`,
    );
    request.flush([]);
  });

  it('should leave API requests unauthenticated when no token is available', () => {
    authSessionStub.accessToken.set(null);
    http.get('http://localhost:3000/service-providers').subscribe();

    const request = httpTesting.expectOne('http://localhost:3000/service-providers');

    expect(request.request.headers.get('Authorization')).toBeNull();
    request.flush([]);
  });

  it('should not send the token to another origin', () => {
    http.get('http://example:3000/service-providers').subscribe();

    const request = httpTesting.expectOne('http://example:3000/service-providers');

    expect(request.request.headers.get('Authorization')).toBeNull();
    request.flush([]);
  });

  describe('authentication requests', () => {
    const paths = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

    it.each(paths)('should preserve the POST %s request without adding a bearer token', (path) => {
      const url = `http://localhost:3000${path}?source=test`;
      const body = { example: 'request payload' };
      const withCredentials = path !== '/auth/register';
      http.post(url, body, { withCredentials }).subscribe();
      const request = httpTesting.expectOne(url);

      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual(body);
      expect(request.request.withCredentials).toBe(withCredentials);
      expect(request.request.headers.has('Authorization')).toBe(false);
      request.flush({});
      expect(authSessionStub.accessToken()).toBe('fake-token');
      expect(authSessionStub.requiredReauthentication).not.toHaveBeenCalled();
    });

    it.each(paths)(
      'should forward a POST %s 401 without clearing the current session or retrying',
      (path) => {
        const url = `http://localhost:3000${path}`;
        const error = vi.fn();
        http.post(url, {}, { withCredentials: path !== '/auth/register' }).subscribe({ error });
        const request = httpTesting.expectOne(url);
        expect(request.request.headers.has('Authorization')).toBe(false);
        const body = { message: 'Unauthorized' };

        request.flush(body, { status: 401, statusText: 'Unauthorized' });

        expect(error).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ status: 401, error: body }),
        );
        expect(authSessionStub.requiredReauthentication).not.toHaveBeenCalled();
        expect(authSessionStub.accessToken()).toBe('fake-token');
        httpTesting.expectNone(url);
      },
    );

    it.each([
      { method: 'GET', path: '/auth/refresh' },
      { method: 'POST', path: '/auth/refresh-extra' },
      { method: 'POST', path: '/service-providers' },
    ])(
      'should keep bearer attachment and renewal-failure cleanup for $method $path',
      ({ method, path }) => {
        const url = `http://localhost:3000${path}`;
        const error = vi.fn();
        http.request(method, url).subscribe({ error });
        const request = httpTesting.expectOne(url);
        expect(request.request.headers.get('Authorization')).toBe('Bearer fake-token');

        request.flush(null, { status: 401, statusText: 'Unauthorized' });

        expect(authSessionStub.requiredReauthentication).toHaveBeenCalledOnce();
        expect(authSessionStub.accessToken()).toBeNull();
        expect(error).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: 401 }));
      },
    );
  });

  describe('response errors', () => {
    it('should clear the local session when renewal fails after a 401 and forward the renewal error', () => {
      const nextSpy = vi.fn();
      const errorSpy = vi.fn();
      http
        .delete('http://localhost:3000/service-providers/7/service-offerings/12')
        .subscribe({ next: nextSpy, error: errorSpy });
      const request = httpTesting.expectOne(
        'http://localhost:3000/service-providers/7/service-offerings/12',
      );
      expect(request.request.headers.get('Authorization')).toBe('Bearer fake-token');
      expect(authSessionStub.requiredReauthentication).not.toHaveBeenCalled();
      const body = { message: 'Unauthorized' };

      request.flush(body, { status: 401, statusText: 'Unauthorized' });

      expect(authSessionStub.requiredReauthentication).toHaveBeenCalledTimes(1);
      expect(authSessionStub.accessToken()).toBeNull();
      expect(nextSpy).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledExactlyOnceWith(expect.any(HttpErrorResponse));
      expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 401, error: body }));
    });

    it.each([
      { status: 403, statusText: 'Forbidden' },
      { status: 500, statusText: 'Internal Server Error' },
    ])(
      'should forward status $status without clearing the local session',
      ({ status, statusText }) => {
        const errorSpy = vi.fn();
        http.get('http://localhost:3000/service-providers/7').subscribe({ error: errorSpy });
        const request = httpTesting.expectOne('http://localhost:3000/service-providers/7');
        const body = { message: 'Request failed' };

        request.flush(body, { status, statusText });

        expect(authSessionStub.requiredReauthentication).not.toHaveBeenCalled();
        expect(authSessionStub.accessToken()).toBe('fake-token');
        expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ status, error: body }),
        );
      },
    );

    it.each([
      { scenario: 'a new session has started', currentToken: 'new-token' },
      { scenario: 'the user has already logged out', currentToken: null },
    ])('should ignore a stale 401 for session cleanup when $scenario', ({ currentToken }) => {
      const errorSpy = vi.fn();
      http.get('http://localhost:3000/service-providers/7').subscribe({ error: errorSpy });
      const request = httpTesting.expectOne('http://localhost:3000/service-providers/7');
      expect(request.request.headers.get('Authorization')).toBe('Bearer fake-token');
      authSessionStub.accessToken.set(currentToken);
      authSessionStub.currentUser.set(currentToken === null ? null : { ...user });

      request.flush(null, { status: 401, statusText: 'Unauthorized' });

      expect(authSessionStub.requiredReauthentication).not.toHaveBeenCalled();
      expect(authSessionStub.accessToken()).toBe(currentToken);
      expect(errorSpy).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: 401 }));
    });

    it('should clear the local session only once when renewal fails and other requests return stale 401s', () => {
      const firstErrorSpy = vi.fn();
      const secondErrorSpy = vi.fn();
      http.get('http://localhost:3000/service-providers/7').subscribe({ error: firstErrorSpy });
      http.get('http://localhost:3000/service-providers/8').subscribe({ error: secondErrorSpy });
      const firstRequest = httpTesting.expectOne('http://localhost:3000/service-providers/7');
      const secondRequest = httpTesting.expectOne('http://localhost:3000/service-providers/8');
      expect(firstRequest.request.headers.get('Authorization')).toBe('Bearer fake-token');
      expect(secondRequest.request.headers.get('Authorization')).toBe('Bearer fake-token');

      firstRequest.flush(null, { status: 401, statusText: 'Unauthorized' });
      secondRequest.flush(null, { status: 401, statusText: 'Unauthorized' });

      expect(authSessionStub.requiredReauthentication).toHaveBeenCalledTimes(1);
      expect(authSessionStub.accessToken()).toBeNull();
      expect(firstErrorSpy).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ status: 401 }),
      );
      expect(secondErrorSpy).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ status: 401 }),
      );
    });

    it.each([
      {
        scenario: 'another origin',
        url: 'http://example:3000/service-providers',
        token: 'fake-token',
        authorization: null,
      },
      {
        scenario: 'a relative URL',
        url: '/assets/config.json',
        token: 'fake-token',
        authorization: null,
      },
      {
        scenario: 'an explicit Authorization header',
        url: 'http://localhost:3000/auth/me',
        token: 'fake-token',
        authorization: 'Bearer explicit-token',
      },
      {
        scenario: 'an API request without a session token',
        url: 'http://localhost:3000/auth/login',
        token: null,
        authorization: null,
      },
    ])(
      'should forward a 401 from $scenario without clearing the local session',
      ({ url, token, authorization }) => {
        authSessionStub.accessToken.set(token);
        const errorSpy = vi.fn();
        http
          .get(url, authorization ? { headers: { Authorization: authorization } } : {})
          .subscribe({ error: errorSpy });
        const request = httpTesting.expectOne(url);
        expect(request.request.headers.get('Authorization')).toBe(authorization);

        request.flush(null, { status: 401, statusText: 'Unauthorized' });

        expect(authSessionStub.requiredReauthentication).not.toHaveBeenCalled();
        expect(authSessionStub.accessToken()).toBe(token);
        expect(errorSpy).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: 401 }));
      },
    );
  });

  describe('automatic token renewal', () => {
    const url = 'http://localhost:3000/service-providers/7';

    function allowRenewal() {
      authSessionStub.renewAccessToken.mockImplementation(() =>
        of('renewed-token').pipe(tap((token) => authSessionStub.accessToken.set(token))),
      );
    }

    it('should renew after a 401 and retry with the new token while preserving the request payload and options', () => {
      allowRenewal();
      const body = { description: 'Updated description' };
      const next = vi.fn();
      http
        .patch(url, body, {
          params: { source: 'test' },
          headers: { 'X-Request-ID': 'request-7' },
          withCredentials: true,
        })
        .subscribe(next);
      const requestUrl = `${url}?source=test`;
      const original = httpTesting.expectOne(requestUrl);
      expect(original.request.headers.get('Authorization')).toBe('Bearer fake-token');
      original.flush(null, { status: 401, statusText: 'Unauthorized' });

      const retry = httpTesting.expectOne(requestUrl);
      expect(retry.request.headers.get('Authorization')).toBe('Bearer renewed-token');
      expect(retry.request.method).toBe('PATCH');
      expect(retry.request.body).toEqual(body);
      expect(retry.request.headers.get('X-Request-ID')).toBe('request-7');
      expect(retry.request.withCredentials).toBe(true);
      retry.flush({ id: 7, ...body });
      expect(next).toHaveBeenCalledExactlyOnceWith({ id: 7, ...body });
      expect(authSessionStub.renewAccessToken).toHaveBeenCalledTimes(1);
      expect(authSessionStub.requiredReauthentication).not.toHaveBeenCalled();
      expect(authSessionStub.currentUser()).toBe(user);
    });

    it('should reuse a token renewed by another request before a delayed 401 arrives', () => {
      const next = vi.fn();
      http.get(url).subscribe(next);
      const original = httpTesting.expectOne(url);
      authSessionStub.accessToken.set('already-renewed-token');

      original.flush(null, { status: 401, statusText: 'Unauthorized' });

      const retry = httpTesting.expectOne(url);
      expect(retry.request.headers.get('Authorization')).toBe('Bearer already-renewed-token');
      retry.flush({ id: 7 });
      expect(next).toHaveBeenCalledExactlyOnceWith({ id: 7 });
      expect(authSessionStub.renewAccessToken).not.toHaveBeenCalled();
      expect(authSessionStub.requiredReauthentication).not.toHaveBeenCalled();
    });

    it.each([401, 403, 500])(
      'should forward retry HTTP %s without renewing a second time',
      (status) => {
        allowRenewal();
        const error = vi.fn();
        http.get(url).subscribe({ error });
        httpTesting.expectOne(url).flush(null, { status: 401, statusText: 'Unauthorized' });
        const retry = httpTesting.expectOne(url);
        retry.flush({ message: 'Retry failed' }, { status, statusText: 'Request failed' });

        expect(authSessionStub.renewAccessToken).toHaveBeenCalledTimes(1);
        expect(error).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status }));
        expect(authSessionStub.requiredReauthentication).toHaveBeenCalledTimes(
          status === 401 ? 1 : 0,
        );
        expect(authSessionStub.accessToken()).toBe(status === 401 ? null : 'renewed-token');
        httpTesting.expectNone(url);
      },
    );

    it('should forward a retry network failure without clearing the session', () => {
      allowRenewal();
      const error = vi.fn();
      http.get(url).subscribe({ error });
      httpTesting.expectOne(url).flush(null, { status: 401, statusText: 'Unauthorized' });
      httpTesting.expectOne(url).error(new ProgressEvent('error'));
      expect(error).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: 0 }));
      expect(authSessionStub.requiredReauthentication).not.toHaveBeenCalled();
      expect(authSessionStub.renewAccessToken).toHaveBeenCalledTimes(1);
    });

    it.each([401, 403, 500, 0])(
      'should clear local identity and forward renewal HTTP %s without retrying',
      (status) => {
        const failure = new HttpErrorResponse({ status });
        authSessionStub.renewAccessToken.mockReturnValue(throwError(() => failure));
        const error = vi.fn();
        http.get(url).subscribe({ error });
        httpTesting.expectOne(url).flush(null, { status: 401, statusText: 'Unauthorized' });

        expect(error).toHaveBeenCalledExactlyOnceWith(failure);
        expect(authSessionStub.requiredReauthentication).toHaveBeenCalledTimes(1);
        expect(authSessionStub.currentUser()).toBeNull();
        httpTesting.expectNone(url);
      },
    );

    it('should forward a renewal timeout and clear the current local session', () => {
      const failure = new TimeoutError();
      authSessionStub.renewAccessToken.mockReturnValue(throwError(() => failure));
      const error = vi.fn();
      http.get(url).subscribe({ error });
      httpTesting.expectOne(url).flush(null, { status: 401, statusText: 'Unauthorized' });
      expect(error).toHaveBeenCalledExactlyOnceWith(failure);
      expect(authSessionStub.requiredReauthentication).toHaveBeenCalledTimes(1);
      httpTesting.expectNone(url);
    });

    it('should not renew or clear identity when the request started without a profile', () => {
      authSessionStub.currentUser.set(null);
      const error = vi.fn();
      http.get(url).subscribe({ error });
      httpTesting.expectOne(url).flush(null, { status: 401, statusText: 'Unauthorized' });
      expect(error).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: 401 }));
      expect(authSessionStub.renewAccessToken).not.toHaveBeenCalled();
      expect(authSessionStub.requiredReauthentication).not.toHaveBeenCalled();
    });

    it.each(['profile', 'token'] as const)(
      'should reject a renewal result when the %s changed before retry',
      (change) => {
        authSessionStub.renewAccessToken.mockImplementation(() =>
          of('renewed-token').pipe(
            tap(() => {
              authSessionStub.accessToken.set(
                change === 'profile' ? 'renewed-token' : 'newer-token',
              );
              if (change === 'profile') authSessionStub.currentUser.set({ ...user, id: 8 });
            }),
          ),
        );
        const error = vi.fn();
        http.get(url).subscribe({ error });
        httpTesting.expectOne(url).flush(null, { status: 401, statusText: 'Unauthorized' });

        httpTesting.expectNone(url);
        expect(error).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: 401 }));
        expect(authSessionStub.requiredReauthentication).not.toHaveBeenCalled();
      },
    );

    it('should preserve a newer login if an older renewal reports an error', () => {
      const pending = new Subject<string>();
      authSessionStub.renewAccessToken.mockReturnValue(pending.asObservable());
      const error = vi.fn();
      http.get(url).subscribe({ error });
      httpTesting.expectOne(url).flush(null, { status: 401, statusText: 'Unauthorized' });
      authSessionStub.currentUser.set({ ...user });
      authSessionStub.accessToken.set('new-login-token');
      const failure = new HttpErrorResponse({ status: 401 });
      pending.error(failure);

      expect(error).toHaveBeenCalledExactlyOnceWith(failure);
      expect(authSessionStub.requiredReauthentication).not.toHaveBeenCalled();
      expect(authSessionStub.accessToken()).toBe('new-login-token');
      httpTesting.expectNone(url);
    });

    it('should preserve a newer session when a retried request receives a late 401', () => {
      allowRenewal();
      const error = vi.fn();
      http.get(url).subscribe({ error });
      httpTesting.expectOne(url).flush(null, { status: 401, statusText: 'Unauthorized' });
      const retry = httpTesting.expectOne(url);
      authSessionStub.currentUser.set({ ...user });
      authSessionStub.accessToken.set('new-login-token');
      retry.flush(null, { status: 401, statusText: 'Unauthorized' });

      expect(error).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: 401 }));
      expect(authSessionStub.requiredReauthentication).not.toHaveBeenCalled();
      expect(authSessionStub.accessToken()).toBe('new-login-token');
      expect(authSessionStub.renewAccessToken).toHaveBeenCalledTimes(1);
    });
  });

  describe('requests forwarded without modification', () => {
    it('should preserve an existing Authorization header', () => {
      http
        .get('http://localhost:3000/auth/me', {
          headers: { Authorization: 'Bearer explicit-token' },
        })
        .subscribe();

      const request = httpTesting.expectOne('http://localhost:3000/auth/me');

      expect(request.request.headers.get('Authorization')).toBe('Bearer explicit-token');
      request.flush({});
    });

    it('should forward relative URLs without adding a token', () => {
      http.get('/assets/config.json').subscribe();

      const request = httpTesting.expectOne('/assets/config.json');

      expect(request.request.headers.get('Authorization')).toBeNull();
      request.flush({});
    });
  });
});
