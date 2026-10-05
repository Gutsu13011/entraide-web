import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './auth-interceptor';
import { signal } from '@angular/core';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthSession } from '../services/auth-session';

describe('authInterceptor', () => {
  const authSessionStub = {
    accessToken: signal<string | null>('fake-token'),
  };

  let http: HttpClient;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    authSessionStub.accessToken.set('fake-token');

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
