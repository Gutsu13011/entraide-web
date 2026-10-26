import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { authInterceptor } from '../interceptors/auth-interceptor';
import { AuthSession } from './auth-session';
import { AuthStore } from './auth-store';
import { NEVER, of, Subject, throwError } from 'rxjs';
import type { CurrentUserResponse, LoginResponse } from '../../models/auth.model';

describe('AuthSession', () => {
  const authStoreStub = {
    login: vi.fn(),
    getCurrentUser: vi.fn(),
    logout: vi.fn(),
    refresh: vi.fn(),
  };

  let service: InstanceType<typeof AuthSession>;

  beforeEach(() => {
    authStoreStub.login.mockReset().mockReturnValue(NEVER);
    authStoreStub.getCurrentUser.mockReset();
    authStoreStub.logout.mockReset().mockReturnValue(of(undefined));
    authStoreStub.refresh.mockReset().mockReturnValue(NEVER);
    TestBed.configureTestingModule({
      providers: [{ provide: AuthStore, useValue: authStoreStub }],
    });
    service = TestBed.inject(AuthSession);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should start without an authenticated session', () => {
    expect(service.accessToken()).toBe(null);
    expect(service.currentUser()).toBe(null);
    expect(service.isLoading()).toBe(false);
    expect(service.errorMessage()).toBe(null);
    expect(service.isAuthenticated()).toBe(false);
  });

  it('should enter loading state when login starts', () => {
    const userMock = {
      email: 'alicemartin@example.com',
      password: 'un-mot-de-passe-d-au-moins-15-caracteres',
    };

    service.login(userMock);
    expect(authStoreStub.login).toHaveBeenCalledWith(userMock);
    expect(service.isLoading()).toBe(true);
  });

  it('should fetch the current user after a successful login', () => {
    const userMock = {
      email: 'alicemartin@example.com',
      password: 'un-mot-de-passe-d-au-moins-15-caracteres',
    };
    authStoreStub.login.mockReturnValue(of({ accessToken: 'fake-token' }));
    authStoreStub.getCurrentUser.mockReturnValue(NEVER);
    service.login(userMock);
    expect(authStoreStub.getCurrentUser).toHaveBeenCalledWith('fake-token');
    expect(service.isLoading()).toBe(true);
  });
  it('should store the token and current user after a successful login', () => {
    const userMock = {
      email: 'alicemartin@example.com',
      password: 'un-mot-de-passe-d-au-moins-15-caracteres',
    };
    const currentUser: CurrentUserResponse = {
      id: 1,
      firstName: 'Alice',
      lastName: 'Martin',
      email: 'alicemartin@example.com',
    };

    authStoreStub.login.mockReturnValue(of({ accessToken: 'fake-token' }));
    authStoreStub.getCurrentUser.mockReturnValue(of(currentUser));
    service.login(userMock);
    expect(service.accessToken()).toBe('fake-token');
    expect(service.currentUser()).toEqual(currentUser);
    expect(service.isLoading()).toBe(false);
    expect(service.errorMessage()).toBe(null);
    expect(service.isAuthenticated()).toBe(true);
  });

  it('should report an error when login fails', () => {
    const userMock = {
      email: 'alicemartin@example.com',
      password: 'un-mot-de-passe-d-au-moins-15-caracteres',
    };

    authStoreStub.login.mockReturnValue(throwError(() => new Error('Login failed')));
    service.login(userMock);
    expect(authStoreStub.getCurrentUser).not.toHaveBeenCalled();
    expect(service.accessToken()).toBe(null);
    expect(service.currentUser()).toBe(null);
    expect(service.isLoading()).toBe(false);
    expect(service.errorMessage()).toBe('Connexion impossible. Veuillez réessayer.');
    expect(service.isAuthenticated()).toBe(false);
  });

  it('should leave the session unauthenticated when fetching the current user fails', () => {
    const userMock = {
      email: 'alicemartin@example.com',
      password: 'un-mot-de-passe-d-au-moins-15-caracteres',
    };

    authStoreStub.login.mockReturnValue(of({ accessToken: 'fake-token' }));
    authStoreStub.getCurrentUser.mockReturnValue(
      throwError(() => new Error('getCurrentUser failed')),
    );
    service.login(userMock);
    expect(authStoreStub.login).toHaveBeenCalledWith(userMock);
    expect(authStoreStub.getCurrentUser).toHaveBeenCalledWith('fake-token');
    expect(service.accessToken()).toBe(null);
    expect(service.currentUser()).toBe(null);
    expect(service.isLoading()).toBe(false);
    expect(service.errorMessage()).toBe('Connexion impossible. Veuillez réessayer.');
    expect(service.isAuthenticated()).toBe(false);
  });

  it('should allow a successful login after a failed attempt', () => {
    const userMock = {
      email: 'alicemartin@example.com',
      password: 'un-mot-de-passe-d-au-moins-15-caracteres',
    };
    const currentUser: CurrentUserResponse = {
      id: 1,
      firstName: 'Alice',
      lastName: 'Martin',
      email: 'alicemartin@example.com',
    };

    authStoreStub.login.mockReturnValueOnce(throwError(() => new Error('Login failed')));
    authStoreStub.login.mockReturnValueOnce(of({ accessToken: 'fake-token' }));
    authStoreStub.getCurrentUser.mockReturnValue(of(currentUser));
    service.login(userMock);
    expect(authStoreStub.getCurrentUser).not.toHaveBeenCalled();
    expect(service.accessToken()).toBe(null);
    expect(service.currentUser()).toBe(null);
    expect(service.isLoading()).toBe(false);
    expect(service.errorMessage()).toBe('Connexion impossible. Veuillez réessayer.');
    expect(service.isAuthenticated()).toBe(false);
    service.login(userMock);
    expect(authStoreStub.login).toHaveBeenCalledTimes(2);
    expect(authStoreStub.getCurrentUser).toHaveBeenCalledTimes(1);
    expect(service.accessToken()).toBe('fake-token');
    expect(service.currentUser()).toEqual(currentUser);
    expect(service.isLoading()).toBe(false);
    expect(service.errorMessage()).toBe(null);
    expect(service.isAuthenticated()).toBe(true);
  });

  it('should ignore additional login attempts while a login is pending', () => {
    const userMock = {
      email: 'alicemartin@example.com',
      password: 'un-mot-de-passe-d-au-moins-15-caracteres',
    };
    service.login(userMock);
    service.login(userMock);
    expect(authStoreStub.login).toHaveBeenCalledTimes(1);
    expect(service.isLoading()).toBe(true);
    expect(authStoreStub.getCurrentUser).toHaveBeenCalledTimes(0);
  });

  it('should clear the authenticated session on logout', () => {
    const userMock = {
      email: 'alicemartin@example.com',
      password: 'un-mot-de-passe-d-au-moins-15-caracteres',
    };
    const currentUser: CurrentUserResponse = {
      id: 1,
      firstName: 'Alice',
      lastName: 'Martin',
      email: 'alicemartin@example.com',
    };

    authStoreStub.login.mockReturnValueOnce(of({ accessToken: 'fake-token' }));
    authStoreStub.getCurrentUser.mockReturnValue(of(currentUser));
    service.login(userMock);
    expect(service.isAuthenticated()).toBe(true);
    service.logout();
    expect(service.accessToken()).toBe(null);
    expect(service.currentUser()).toBe(null);
    expect(service.isLoading()).toBe(false);
    expect(service.errorMessage()).toBe(null);
    expect(service.isAuthenticated()).toBe(false);
  });

  it('should ignore pending login responses after logout', () => {
    const userMock = {
      email: 'alicemartin@example.com',
      password: 'un-mot-de-passe-d-au-moins-15-caracteres',
    };
    const currentUser: CurrentUserResponse = {
      id: 1,
      firstName: 'Alice',
      lastName: 'Martin',
      email: 'alicemartin@example.com',
    };

    const profileResponse = new Subject<CurrentUserResponse>();

    authStoreStub.login.mockReturnValue(of({ accessToken: 'fake-token' }));
    authStoreStub.getCurrentUser.mockReturnValue(profileResponse.asObservable());
    service.login(userMock);
    expect(service.isLoading()).toBe(true);
    service.logout();
    profileResponse.next(currentUser);
    profileResponse.complete();
    expect(service.accessToken()).toBe(null);
    expect(service.currentUser()).toBe(null);
    expect(service.isAuthenticated()).toBe(false);
    expect(service.isLoading()).toBe(false);
    expect(service.errorMessage()).toBe(null);
  });
  describe('clearSession', () => {
    const credentials = { email: 'alice@example.test', password: 'test-only-password' };
    const user: CurrentUserResponse = {
      id: 7,
      firstName: 'Alice',
      lastName: 'Martin',
      email: credentials.email,
    };

    it('should clear local identity without calling server logout', () => {
      authStoreStub.login.mockReturnValue(of({ accessToken: 'test-access-token' }));
      authStoreStub.getCurrentUser.mockReturnValue(of(user));
      service.login(credentials);
      expect(service.isAuthenticated()).toBe(true);

      service.clearSession();

      expect(service.accessToken()).toBeNull();
      expect(service.currentUser()).toBeNull();
      expect(service.isAuthenticated()).toBe(false);
      expect(service.isLoading()).toBe(false);
      expect(service.errorMessage()).toBeNull();
      expect(authStoreStub.logout).not.toHaveBeenCalled();
    });

    it('should cancel a pending login and ignore its later response', () => {
      const pending = new Subject<LoginResponse>();
      authStoreStub.login.mockReturnValue(pending.asObservable());
      service.login(credentials);
      expect(pending.observed).toBe(true);

      service.clearSession();
      expect(pending.observed).toBe(false);
      pending.next({ accessToken: 'late-access-token' });
      pending.complete();

      expect(authStoreStub.getCurrentUser).not.toHaveBeenCalled();
      expect(authStoreStub.logout).not.toHaveBeenCalled();
      expect(service.isAuthenticated()).toBe(false);
      expect(service.isLoading()).toBe(false);
    });

    it('should cancel a pending profile lookup and allow a later login', () => {
      const pending = new Subject<CurrentUserResponse>();
      authStoreStub.login.mockReturnValue(of({ accessToken: 'test-access-token' }));
      authStoreStub.getCurrentUser
        .mockReturnValueOnce(pending.asObservable())
        .mockReturnValueOnce(of(user));
      service.login(credentials);
      expect(pending.observed).toBe(true);

      service.clearSession();
      expect(pending.observed).toBe(false);
      pending.next(user);
      pending.complete();
      expect(service.isAuthenticated()).toBe(false);
      expect(authStoreStub.logout).not.toHaveBeenCalled();

      service.login(credentials);
      expect(service.isAuthenticated()).toBe(true);
      expect(service.currentUser()).toEqual(user);
      expect(service.accessToken()).toBe('test-access-token');
    });
  });
  describe('restore', () => {
    const credentials = { email: 'alice@example.test', password: 'test-only-password' };
    const user: CurrentUserResponse = {
      id: 7,
      firstName: 'Alice',
      lastName: 'Martin',
      email: credentials.email,
    };
    const message = 'Impossible de restaurer la session. Veuillez réessayer.';

    beforeEach(() => {
      authStoreStub.refresh.mockReturnValue(of({ accessToken: 'restored-token' }));
      authStoreStub.getCurrentUser.mockReturnValue(of(user));
    });

    afterEach(() => service.clearSession());

    it('should start restoration and change local state only when subscribed', () => {
      authStoreStub.login.mockReturnValue(of({ accessToken: 'previous-token' }));
      service.login(credentials);
      const pending = new Subject<LoginResponse>();
      authStoreStub.refresh.mockReturnValue(pending.asObservable());

      const restoration = service.restore();

      expect(authStoreStub.refresh).not.toHaveBeenCalled();
      expect(service.accessToken()).toBe('previous-token');
      expect(service.isAuthenticated()).toBe(true);
      expect(service.isLoading()).toBe(false);
      const subscription = restoration.subscribe();
      expect(authStoreStub.refresh).toHaveBeenCalledOnce();
      expect(pending.observed).toBe(true);
      expect(service.accessToken()).toBeNull();
      expect(service.currentUser()).toBeNull();
      expect(service.isLoading()).toBe(true);
      subscription.unsubscribe();
      expect(pending.observed).toBe(false);
      expect(service.isLoading()).toBe(false);
    });

    it('should wait for the profile and store identity with the restored token before completing', () => {
      const token = new Subject<LoginResponse>();
      const profile = new Subject<CurrentUserResponse>();
      authStoreStub.refresh.mockReturnValue(token.asObservable());
      authStoreStub.getCurrentUser.mockReturnValue(profile.asObservable());
      const next = vi.fn();
      const complete = vi.fn();
      service.restore().subscribe({ next, complete });
      expect(service.isLoading()).toBe(true);
      expect(authStoreStub.getCurrentUser).not.toHaveBeenCalled();

      token.next({ accessToken: 'restored-token' });
      token.complete();

      expect(authStoreStub.getCurrentUser).toHaveBeenCalledExactlyOnceWith('restored-token');
      expect(service.accessToken()).toBeNull();
      expect(service.currentUser()).toBeNull();
      expect(service.isAuthenticated()).toBe(false);
      expect(complete).not.toHaveBeenCalled();
      service.login(credentials);
      expect(authStoreStub.login).not.toHaveBeenCalled();
      profile.next(user);
      profile.complete();
      expect(service.accessToken()).toBe('restored-token');
      expect(service.currentUser()).toEqual(user);
      expect(service.isAuthenticated()).toBe(true);
      expect(service.isLoading()).toBe(false);
      expect(service.errorMessage()).toBeNull();
      expect(next).toHaveBeenCalledExactlyOnceWith(undefined);
      expect(complete).toHaveBeenCalledOnce();
      expect(authStoreStub.logout).not.toHaveBeenCalled();
    });

    it.each([
      { phase: 'refresh', status: 401 },
      { phase: 'profile', status: 401 },
      { phase: 'refresh', status: 0 },
      { phase: 'refresh', status: 403 },
      { phase: 'refresh', status: 500 },
      { phase: 'profile', status: 500 },
    ])(
      'should complete anonymously after a $phase failure with status $status',
      ({ phase, status }) => {
        const failure = throwError(() => new HttpErrorResponse({ status }));
        if (phase === 'refresh') authStoreStub.refresh.mockReturnValueOnce(failure);
        else authStoreStub.getCurrentUser.mockReturnValueOnce(failure);
        const next = vi.fn();
        const complete = vi.fn();
        const error = vi.fn();

        service.restore().subscribe({ next, complete, error });

        expect(service.accessToken()).toBeNull();
        expect(service.currentUser()).toBeNull();
        expect(service.isAuthenticated()).toBe(false);
        expect(service.isLoading()).toBe(false);
        expect(service.errorMessage()).toBe(status === 401 ? null : message);
        expect(error).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledExactlyOnceWith(undefined);
        expect(complete).toHaveBeenCalledOnce();
        expect(authStoreStub.logout).not.toHaveBeenCalled();
        if (phase === 'refresh') expect(authStoreStub.getCurrentUser).not.toHaveBeenCalled();
      },
    );

    it.each(['login', 'logout'])(
      'should leave a pending %s operation intact and skip another restoration',
      (operation) => {
        const pending = new Subject<void>();
        if (operation === 'login') service.login(credentials);
        else {
          authStoreStub.logout.mockReturnValueOnce(pending.asObservable());
          service.logout();
        }
        const complete = vi.fn();
        service.restore().subscribe({ complete });

        expect(authStoreStub.refresh).not.toHaveBeenCalled();
        expect(service.isLoading()).toBe(true);
        expect(complete).toHaveBeenCalledOnce();
        if (operation === 'logout') {
          pending.next(undefined);
          pending.complete();
        }
      },
    );

    it.each([
      { phase: 'refresh', action: 'clearSession' },
      { phase: 'profile', action: 'logout' },
    ])(
      'should cancel the pending $phase request on $action and ignore late identity',
      ({ phase, action }) => {
        const token = new Subject<LoginResponse>();
        const profile = new Subject<CurrentUserResponse>();
        authStoreStub.refresh.mockReturnValue(token.asObservable());
        authStoreStub.getCurrentUser.mockReturnValue(profile.asObservable());
        const complete = vi.fn();
        service.restore().subscribe({ complete });
        if (phase === 'profile') {
          token.next({ accessToken: 'restored-token' });
          token.complete();
          expect(profile.observed).toBe(true);
        } else expect(token.observed).toBe(true);

        if (action === 'logout') service.logout();
        else service.clearSession();
        expect(token.observed).toBe(false);
        expect(profile.observed).toBe(false);
        token.next({ accessToken: 'late-token' });
        profile.next(user);
        token.complete();
        profile.complete();
        expect(complete).toHaveBeenCalledOnce();
        expect(service.isAuthenticated()).toBe(false);
        expect(service.accessToken()).toBeNull();
        expect(service.currentUser()).toBeNull();
        expect(service.isLoading()).toBe(false);
        expect(authStoreStub.logout).toHaveBeenCalledTimes(action === 'logout' ? 1 : 0);
      },
    );

    it('should bound the combined token and profile wait to ten seconds and allow a later restoration', () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
      try {
        const token = new Subject<LoginResponse>();
        const profile = new Subject<CurrentUserResponse>();
        authStoreStub.refresh.mockReturnValueOnce(token.asObservable());
        authStoreStub.getCurrentUser.mockReturnValueOnce(profile.asObservable());
        const complete = vi.fn();
        service.restore().subscribe({ complete });
        vi.advanceTimersByTime(6000);
        token.next({ accessToken: 'restored-token' });
        token.complete();
        vi.advanceTimersByTime(3999);
        expect(service.isLoading()).toBe(true);
        expect(complete).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);

        expect(profile.observed).toBe(false);
        expect(service.isLoading()).toBe(false);
        expect(service.isAuthenticated()).toBe(false);
        expect(service.errorMessage()).toBe(message);
        expect(complete).toHaveBeenCalledOnce();
        expect(authStoreStub.logout).not.toHaveBeenCalled();
        service.restore().subscribe();
        expect(service.isAuthenticated()).toBe(true);
        expect(service.errorMessage()).toBeNull();
      } finally {
        service.clearSession();
        vi.useRealTimers();
      }
    });
  });

  describe('server logout', () => {
    const credentials = { email: 'alice@example.test', password: 'test-only-password' };
    const user: CurrentUserResponse = {
      id: 7,
      firstName: 'Alice',
      lastName: 'Martin',
      email: credentials.email,
    };
    const message = 'Déconnexion serveur impossible. Veuillez réessayer.';

    function signIn() {
      authStoreStub.login.mockReturnValue(of({ accessToken: 'test-access-token' }));
      authStoreStub.getCurrentUser.mockReturnValue(of(user));
      service.login(credentials);
    }

    it('should immediately clear local identity and wait for server logout to finish', () => {
      signIn();
      const response = new Subject<void>();
      authStoreStub.logout.mockReturnValueOnce(response.asObservable());

      service.logout();

      expect(authStoreStub.logout).toHaveBeenCalledOnce();
      expect(service.accessToken()).toBeNull();
      expect(service.currentUser()).toBeNull();
      expect(service.isAuthenticated()).toBe(false);
      expect(service.isLoading()).toBe(true);
      expect(service.errorMessage()).toBeNull();
      response.next(undefined);
      response.complete();
      expect(service.isLoading()).toBe(false);
      expect(service.errorMessage()).toBeNull();
    });

    it('should ignore duplicate logout and new login attempts until revocation completes', () => {
      signIn();
      const response = new Subject<void>();
      authStoreStub.logout.mockReturnValueOnce(response.asObservable());
      service.logout();
      service.logout();
      service.login(credentials);

      expect(authStoreStub.logout).toHaveBeenCalledOnce();
      expect(authStoreStub.login).toHaveBeenCalledTimes(1);
      expect(service.isLoading()).toBe(true);
      expect(service.isAuthenticated()).toBe(false);
      response.next(undefined);
      response.complete();
      service.login(credentials);
      expect(authStoreStub.login).toHaveBeenCalledTimes(2);
      expect(service.isAuthenticated()).toBe(true);
    });

    it.each([0, 500])(
      'should report a logout failure, release loading and allow an explicit retry: %i',
      (status) => {
        signIn();
        authStoreStub.logout.mockReturnValueOnce(
          throwError(() => new HttpErrorResponse({ status })),
        );

        service.logout();

        expect(service.isAuthenticated()).toBe(false);
        expect(service.accessToken()).toBeNull();
        expect(service.currentUser()).toBeNull();
        expect(service.isLoading()).toBe(false);
        expect(service.errorMessage()).toBe(message);
        expect(authStoreStub.logout).toHaveBeenCalledOnce();
        service.logout();
        expect(authStoreStub.logout).toHaveBeenCalledTimes(2);
        expect(service.errorMessage()).toBeNull();
        expect(service.isLoading()).toBe(false);
      },
    );

    it('should stop waiting after ten seconds and keep logout available for a retry', () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
      try {
        signIn();
        authStoreStub.logout.mockReturnValueOnce(NEVER);
        service.logout();
        vi.advanceTimersByTime(9999);
        expect(service.isLoading()).toBe(true);
        expect(service.errorMessage()).toBeNull();

        vi.advanceTimersByTime(1);

        expect(service.isLoading()).toBe(false);
        expect(service.errorMessage()).toBe(message);
        expect(service.isAuthenticated()).toBe(false);
        expect(authStoreStub.logout).toHaveBeenCalledOnce();
        service.logout();
        expect(authStoreStub.logout).toHaveBeenCalledTimes(2);
        expect(service.errorMessage()).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

describe('AuthSession HTTP authentication integration', () => {
  const url = 'http://localhost:3000/auth';
  const credentials = { email: 'alice@example.test', password: 'test-only-password' };
  const user: CurrentUserResponse = {
    id: 7,
    firstName: 'Alice',
    lastName: 'Martin',
    email: credentials.email,
  };
  let session: InstanceType<typeof AuthSession>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    session = TestBed.inject(AuthSession);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function signIn() {
    session.login(credentials);
    http.expectOne(`${url}/login`).flush({ accessToken: 'test-access-token' });
    http.expectOne(`${url}/me`).flush(user);
    expect(session.isAuthenticated()).toBe(true);
  }

  it('should send the logout cookie request after clearing the token and finish on a 204 response', () => {
    signIn();
    session.logout();
    const request = http.expectOne(`${url}/logout`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(session.isAuthenticated()).toBe(false);
    expect(session.isLoading()).toBe(true);

    request.flush(null, { status: 204, statusText: 'No Content' });

    expect(session.isLoading()).toBe(false);
    expect(session.errorMessage()).toBeNull();
  });

  it('should report a logout 401 without issuing another logout request through the interceptor', () => {
    signIn();
    session.logout();
    http
      .expectOne(`${url}/logout`)
      .flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    expect(session.isAuthenticated()).toBe(false);
    expect(session.isLoading()).toBe(false);
    expect(session.errorMessage()).toBe('Déconnexion serveur impossible. Veuillez réessayer.');
    http.expectNone(`${url}/logout`);
    session.logout();
    http.expectOne(`${url}/logout`).flush(null, { status: 204, statusText: 'No Content' });
    expect(session.errorMessage()).toBeNull();
  });

  it('should cancel a pending profile request before sending logout and keep the session anonymous', () => {
    session.login(credentials);
    http.expectOne(`${url}/login`).flush({ accessToken: 'test-access-token' });
    const profile = http.expectOne(`${url}/me`);

    session.logout();

    expect(profile.cancelled).toBe(true);
    const logout = http.expectOne(`${url}/logout`);
    expect(logout.request.withCredentials).toBe(true);
    logout.flush(null, { status: 204, statusText: 'No Content' });
    expect(session.currentUser()).toBeNull();
    expect(session.accessToken()).toBeNull();
    expect(session.isLoading()).toBe(false);
  });
  it('should restore through cookie transport and fetch the profile with the renewed bearer token', () => {
    const complete = vi.fn();
    session.restore().subscribe({ complete });
    const refresh = http.expectOne(`${url}/refresh`);
    expect(refresh.request.method).toBe('POST');
    expect(refresh.request.withCredentials).toBe(true);
    expect(refresh.request.headers.has('Authorization')).toBe(false);
    refresh.flush({ accessToken: 'restored-token' });
    const profile = http.expectOne(`${url}/me`);
    expect(profile.request.headers.get('Authorization')).toBe('Bearer restored-token');
    expect(session.isAuthenticated()).toBe(false);
    expect(complete).not.toHaveBeenCalled();
    profile.flush(user);

    expect(session.accessToken()).toBe('restored-token');
    expect(session.currentUser()).toEqual(user);
    expect(session.isAuthenticated()).toBe(true);
    expect(session.isLoading()).toBe(false);
    expect(complete).toHaveBeenCalledOnce();
    http.expectNone(`${url}/logout`);
  });

  it('should finish as an anonymous visitor after a refresh 401 without calling logout', () => {
    const complete = vi.fn();
    const error = vi.fn();
    session.restore().subscribe({ complete, error });
    http
      .expectOne(`${url}/refresh`)
      .flush({ message: 'Invalid refresh session' }, { status: 401, statusText: 'Unauthorized' });

    expect(session.isAuthenticated()).toBe(false);
    expect(session.isLoading()).toBe(false);
    expect(session.errorMessage()).toBeNull();
    expect(complete).toHaveBeenCalledOnce();
    expect(error).not.toHaveBeenCalled();
    http.expectNone(`${url}/logout`);
    http.expectNone(`${url}/me`);
  });
});
