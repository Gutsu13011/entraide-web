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

describe('authInterceptor', () => {
  const authSessionStub = {
    accessToken: signal<string | null>('fake-token'),
    logout: vi.fn(),
  };

  let http: HttpClient;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    authSessionStub.accessToken.set('fake-token');
    authSessionStub.logout.mockReset().mockImplementation(() => {
      authSessionStub.accessToken.set(null);
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

  describe('response errors', () => {
    it('should log out the current session on 401 and forward the error to the subscriber', () => {
      const nextSpy = vi.fn();
      const errorSpy = vi.fn();
      http
        .delete('http://localhost:3000/service-providers/7/service-offerings/12')
        .subscribe({ next: nextSpy, error: errorSpy });
      const request = httpTesting.expectOne(
        'http://localhost:3000/service-providers/7/service-offerings/12',
      );
      expect(request.request.headers.get('Authorization')).toBe('Bearer fake-token');
      expect(authSessionStub.logout).not.toHaveBeenCalled();
      const body = { message: 'Unauthorized' };

      request.flush(body, { status: 401, statusText: 'Unauthorized' });

      expect(authSessionStub.logout).toHaveBeenCalledTimes(1);
      expect(authSessionStub.accessToken()).toBeNull();
      expect(nextSpy).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledExactlyOnceWith(expect.any(HttpErrorResponse));
      expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 401, error: body }));
    });

    it.each([
      { status: 403, statusText: 'Forbidden' },
      { status: 500, statusText: 'Internal Server Error' },
    ])(
      'should forward status $status without logging out the session',
      ({ status, statusText }) => {
        const errorSpy = vi.fn();
        http.get('http://localhost:3000/service-providers/7').subscribe({ error: errorSpy });
        const request = httpTesting.expectOne('http://localhost:3000/service-providers/7');
        const body = { message: 'Request failed' };

        request.flush(body, { status, statusText });

        expect(authSessionStub.logout).not.toHaveBeenCalled();
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

      request.flush(null, { status: 401, statusText: 'Unauthorized' });

      expect(authSessionStub.logout).not.toHaveBeenCalled();
      expect(authSessionStub.accessToken()).toBe(currentToken);
      expect(errorSpy).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: 401 }));
    });

    it('should log out only once when concurrent requests return 401 for the same token', () => {
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

      expect(authSessionStub.logout).toHaveBeenCalledTimes(1);
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
      'should forward a 401 from $scenario without logging out the session',
      ({ url, token, authorization }) => {
        authSessionStub.accessToken.set(token);
        const errorSpy = vi.fn();
        http
          .get(url, authorization ? { headers: { Authorization: authorization } } : {})
          .subscribe({ error: errorSpy });
        const request = httpTesting.expectOne(url);
        expect(request.request.headers.get('Authorization')).toBe(authorization);

        request.flush(null, { status: 401, statusText: 'Unauthorized' });

        expect(authSessionStub.logout).not.toHaveBeenCalled();
        expect(authSessionStub.accessToken()).toBe(token);
        expect(errorSpy).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: 401 }));
      },
    );
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
