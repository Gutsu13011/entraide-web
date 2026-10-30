import { TestBed } from '@angular/core/testing';
import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
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

  it('should start without an authenticated session', () => {
    expect(service.accessToken()).toBe(null);
    expect(service.currentUser()).toBe(null);
    expect(service.isLoading()).toBe(false);
    expect(service.errorMessage()).toBe(null);
    expect(service.isAuthenticated()).toBe(false);
    expect(service.reauthenticationRequired()).toBe(false);
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
  describe('requiredReauthentication', () => {
    const credentials = { email: 'alice@example.test', password: 'test-only-password' };
    const user: CurrentUserResponse = {
      id: 7,
      firstName: 'Alice',
      lastName: 'Martin',
      email: credentials.email,
    };
    const message = 'Votre session ne peut plus être utilisée. Veuillez vous reconnecter.';

    function signIn() {
      authStoreStub.login.mockReturnValue(of({ accessToken: 'previous-token' }));
      authStoreStub.getCurrentUser.mockReturnValue(of(user));
      service.login(credentials);
    }

    afterEach(() => service.clearSession());

    it('should clear the active identity, request reauthentication and expose its message without server logout', () => {
      signIn();
      service.requiredReauthentication();

      expect(service.accessToken()).toBeNull();
      expect(service.currentUser()).toBeNull();
      expect(service.isAuthenticated()).toBe(false);
      expect(service.isLoading()).toBe(false);
      expect(service.reauthenticationRequired()).toBe(true);
      expect(service.errorMessage()).toBe(message);
      expect(authStoreStub.logout).not.toHaveBeenCalled();
    });

    it('should cancel every shared renewal subscriber before marking reauthentication as required', () => {
      signIn();
      const pending = new Subject<LoginResponse>();
      authStoreStub.refresh.mockReturnValue(pending.asObservable());
      const firstComplete = vi.fn();
      const secondComplete = vi.fn();
      const next = vi.fn();
      service.renewAccessToken().subscribe({ next, complete: firstComplete });
      service.renewAccessToken().subscribe({ next, complete: secondComplete });
      expect(pending.observed).toBe(true);

      service.requiredReauthentication();

      expect(pending.observed).toBe(false);
      expect(firstComplete).toHaveBeenCalledTimes(1);
      expect(secondComplete).toHaveBeenCalledTimes(1);
      pending.next({ accessToken: 'late-token' });
      pending.complete();
      expect(next).not.toHaveBeenCalled();
      expect(service.reauthenticationRequired()).toBe(true);
      expect(service.accessToken()).toBeNull();
      expect(service.errorMessage()).toBe(message);
    });

    it.each(['login', 'profile'] as const)(
      'should cancel a pending %s and prevent late identity restoration',
      (phase) => {
        const pendingLogin = new Subject<LoginResponse>();
        const pendingProfile = new Subject<CurrentUserResponse>();
        authStoreStub.login.mockReturnValue(pendingLogin.asObservable());
        authStoreStub.getCurrentUser.mockReturnValue(pendingProfile.asObservable());
        service.login(credentials);
        if (phase === 'profile') pendingLogin.next({ accessToken: 'pending-token' });
        expect(phase === 'login' ? pendingLogin.observed : pendingProfile.observed).toBe(true);

        service.requiredReauthentication();

        expect(pendingLogin.observed).toBe(false);
        expect(pendingProfile.observed).toBe(false);
        pendingLogin.next({ accessToken: 'late-token' });
        pendingProfile.next(user);
        pendingLogin.complete();
        pendingProfile.complete();
        expect(service.isAuthenticated()).toBe(false);
        expect(service.isLoading()).toBe(false);
        expect(service.reauthenticationRequired()).toBe(true);
        expect(service.errorMessage()).toBe(message);
      },
    );

    it('should reset the reauthentication requirement and message during ordinary local cleanup', () => {
      service.requiredReauthentication();
      service.clearSession();
      expect(service.reauthenticationRequired()).toBe(false);
      expect(service.errorMessage()).toBeNull();
      expect(authStoreStub.logout).not.toHaveBeenCalled();
    });

    it('should reset the requirement when a new login starts and keep it reset after success', () => {
      service.requiredReauthentication();
      const pending = new Subject<LoginResponse>();
      authStoreStub.login.mockReturnValue(pending.asObservable());
      authStoreStub.getCurrentUser.mockReturnValue(of(user));
      service.login(credentials);
      expect(service.reauthenticationRequired()).toBe(false);
      expect(service.errorMessage()).toBeNull();
      expect(service.isLoading()).toBe(true);

      pending.next({ accessToken: 'new-login-token' });
      pending.complete();
      expect(service.reauthenticationRequired()).toBe(false);
      expect(service.isAuthenticated()).toBe(true);
      expect(service.accessToken()).toBe('new-login-token');
    });

    it('should reset the requirement on manual logout while the server request is pending', () => {
      service.requiredReauthentication();
      const pending = new Subject<void>();
      authStoreStub.logout.mockReturnValue(pending.asObservable());
      service.logout();
      expect(service.reauthenticationRequired()).toBe(false);
      expect(service.errorMessage()).toBeNull();
      expect(service.isLoading()).toBe(true);
      expect(authStoreStub.logout).toHaveBeenCalledTimes(1);
      pending.next();
      pending.complete();
      expect(service.reauthenticationRequired()).toBe(false);
      expect(service.isLoading()).toBe(false);
    });

    it('should reset the requirement when restoration starts and retain the restored identity on success', () => {
      service.requiredReauthentication();
      const pending = new Subject<LoginResponse>();
      authStoreStub.refresh.mockReturnValue(pending.asObservable());
      authStoreStub.getCurrentUser.mockReturnValue(of(user));
      service.restore().subscribe();
      expect(service.reauthenticationRequired()).toBe(false);
      expect(service.errorMessage()).toBeNull();

      pending.next({ accessToken: 'restored-token' });
      pending.complete();
      expect(service.isAuthenticated()).toBe(true);
      expect(service.reauthenticationRequired()).toBe(false);
    });
  });

  describe('renewAccessToken', () => {
    const credentials = { email: 'alice@example.test', password: 'test-only-password' };
    const user: CurrentUserResponse = {
      id: 7,
      firstName: 'Alice',
      lastName: 'Martin',
      email: credentials.email,
    };

    function signIn(accessToken = 'previous-token'): void {
      authStoreStub.login.mockReturnValue(of({ accessToken }));
      authStoreStub.getCurrentUser.mockReturnValue(of(user));
      service.login(credentials);
    }

    afterEach(() => service.clearSession());

    it('should wait for subscription and replace only the token without fetching the profile again', () => {
      signIn();
      const pending = new Subject<LoginResponse>();
      authStoreStub.refresh.mockReturnValue(pending.asObservable());
      const renewal = service.renewAccessToken();
      const next = vi.fn();
      const complete = vi.fn();

      expect(authStoreStub.refresh).not.toHaveBeenCalled();
      expect(service.accessToken()).toBe('previous-token');
      renewal.subscribe({ next, complete });
      expect(authStoreStub.refresh).toHaveBeenCalledTimes(1);
      expect(service.currentUser()).toEqual(user);
      expect(service.isLoading()).toBe(false);
      expect(next).not.toHaveBeenCalled();

      pending.next({ accessToken: 'renewed-token' });
      pending.complete();

      expect(next).toHaveBeenCalledExactlyOnceWith('renewed-token');
      expect(complete).toHaveBeenCalledTimes(1);
      expect(service.accessToken()).toBe('renewed-token');
      expect(service.currentUser()).toEqual(user);
      expect(service.isAuthenticated()).toBe(true);
      expect(service.isLoading()).toBe(false);
      expect(service.errorMessage()).toBeNull();
      expect(authStoreStub.getCurrentUser).toHaveBeenCalledTimes(1);
    });

    it('should reject renewal without an active session before calling the API', () => {
      const error = vi.fn();
      const renewal = service.renewAccessToken();
      expect(error).not.toHaveBeenCalled();

      renewal.subscribe({ error });

      expect(error).toHaveBeenCalledExactlyOnceWith(new Error('No active session'));
      expect(authStoreStub.refresh).not.toHaveBeenCalled();
    });

    it.each([0, 401, 500])(
      'should forward HTTP %s to its caller while preserving the current identity',
      (status) => {
        signIn();
        const failure = new HttpErrorResponse({ status });
        authStoreStub.refresh.mockReturnValue(throwError(() => failure));
        const error = vi.fn();
        const next = vi.fn();

        service.renewAccessToken().subscribe({ next, error });

        expect(error).toHaveBeenCalledExactlyOnceWith(failure);
        expect(next).not.toHaveBeenCalled();
        expect(authStoreStub.refresh).toHaveBeenCalledTimes(1);
        expect(authStoreStub.logout).not.toHaveBeenCalled();
        expect(service.accessToken()).toBe('previous-token');
        expect(service.currentUser()).toEqual(user);
        expect(service.errorMessage()).toBeNull();
      },
    );

    it.each(['clearSession', 'logout'] as const)(
      'should cancel renewal on %s and ignore a later token',
      (action) => {
        signIn();
        const pending = new Subject<LoginResponse>();
        authStoreStub.refresh.mockReturnValue(pending.asObservable());
        const next = vi.fn();
        const complete = vi.fn();
        service.renewAccessToken().subscribe({ next, complete });
        expect(pending.observed).toBe(true);

        service[action]();

        expect(pending.observed).toBe(false);
        expect(complete).toHaveBeenCalledTimes(1);
        pending.next({ accessToken: 'late-token' });
        pending.complete();
        expect(next).not.toHaveBeenCalled();
        expect(service.accessToken()).toBeNull();
        expect(service.currentUser()).toBeNull();
      },
    );

    it('should cancel the previous renewal when a new login starts without cancelling the new login', () => {
      signIn();
      const pendingRenewal = new Subject<LoginResponse>();
      const pendingLogin = new Subject<LoginResponse>();
      authStoreStub.refresh.mockReturnValue(pendingRenewal.asObservable());
      authStoreStub.login.mockReturnValue(pendingLogin.asObservable());
      const next = vi.fn();
      const error = vi.fn();
      const complete = vi.fn();
      service.renewAccessToken().subscribe({ next, error, complete });
      expect(pendingRenewal.observed).toBe(true);

      service.login(credentials);

      expect(pendingRenewal.observed).toBe(false);
      expect(complete).toHaveBeenCalledTimes(1);
      expect(pendingLogin.observed).toBe(true);
      expect(service.accessToken()).toBeNull();
      expect(service.currentUser()).toBeNull();
      expect(service.isLoading()).toBe(true);

      pendingRenewal.next({ accessToken: 'stale-renewal-token' });
      pendingRenewal.complete();
      expect(next).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();

      pendingLogin.next({ accessToken: 'new-login-token' });
      pendingLogin.complete();
      expect(service.accessToken()).toBe('new-login-token');
      expect(service.currentUser()).toEqual(user);
      expect(service.isLoading()).toBe(false);
      expect(service.isAuthenticated()).toBe(true);
      expect(authStoreStub.logout).not.toHaveBeenCalled();
    });

    it('should share one pending renewal across separate calls and repeated subscriptions', () => {
      signIn();
      const pending = new Subject<LoginResponse>();
      authStoreStub.refresh.mockReturnValue(pending.asObservable());
      const firstRenewal = service.renewAccessToken();
      const secondRenewal = service.renewAccessToken();
      const subscribers = [vi.fn(), vi.fn(), vi.fn()];
      expect(authStoreStub.refresh).not.toHaveBeenCalled();

      firstRenewal.subscribe(subscribers[0]);
      secondRenewal.subscribe(subscribers[1]);
      firstRenewal.subscribe(subscribers[2]);

      expect(authStoreStub.refresh).toHaveBeenCalledTimes(1);
      pending.next({ accessToken: 'shared-token' });
      pending.complete();
      for (const next of subscribers) {
        expect(next).toHaveBeenCalledExactlyOnceWith('shared-token');
      }
      expect(service.accessToken()).toBe('shared-token');
      expect(service.currentUser()).toEqual(user);
      expect(authStoreStub.getCurrentUser).toHaveBeenCalledTimes(1);
    });

    it('should keep renewal running while another subscriber is still waiting', () => {
      signIn();
      const pending = new Subject<LoginResponse>();
      authStoreStub.refresh.mockReturnValue(pending.asObservable());
      const firstNext = vi.fn();
      const secondNext = vi.fn();
      const first = service.renewAccessToken().subscribe(firstNext);
      service.renewAccessToken().subscribe(secondNext);

      first.unsubscribe();

      expect(pending.observed).toBe(true);
      pending.next({ accessToken: 'remaining-subscriber-token' });
      pending.complete();
      expect(firstNext).not.toHaveBeenCalled();
      expect(secondNext).toHaveBeenCalledExactlyOnceWith('remaining-subscriber-token');
      expect(authStoreStub.refresh).toHaveBeenCalledTimes(1);
    });

    it('should cancel when every subscriber leaves and create a fresh renewal for the next subscriber', () => {
      signIn();
      const pending = new Subject<LoginResponse>();
      authStoreStub.refresh.mockReturnValue(pending.asObservable());
      const first = service.renewAccessToken().subscribe();
      const second = service.renewAccessToken().subscribe();

      first.unsubscribe();
      second.unsubscribe();

      expect(pending.observed).toBe(false);
      expect(service.accessToken()).toBe('previous-token');
      authStoreStub.refresh.mockReturnValue(of({ accessToken: 'fresh-token' }));
      const next = vi.fn();
      service.renewAccessToken().subscribe(next);
      expect(authStoreStub.refresh).toHaveBeenCalledTimes(2);
      expect(next).toHaveBeenCalledExactlyOnceWith('fresh-token');
    });

    it('should forward a shared failure to every subscriber and allow a later retry', () => {
      signIn();
      const pending = new Subject<LoginResponse>();
      authStoreStub.refresh.mockReturnValue(pending.asObservable());
      const firstError = vi.fn();
      const secondError = vi.fn();
      service.renewAccessToken().subscribe({ error: firstError });
      service.renewAccessToken().subscribe({ error: secondError });
      const failure = new HttpErrorResponse({ status: 401 });

      pending.error(failure);

      expect(firstError).toHaveBeenCalledExactlyOnceWith(failure);
      expect(secondError).toHaveBeenCalledExactlyOnceWith(failure);
      expect(authStoreStub.refresh).toHaveBeenCalledTimes(1);
      authStoreStub.refresh.mockReturnValue(of({ accessToken: 'retry-token' }));
      service.renewAccessToken().subscribe();
      expect(authStoreStub.refresh).toHaveBeenCalledTimes(2);
      expect(service.accessToken()).toBe('retry-token');
    });

    it('should start another renewal after success instead of replaying a completed renewal forever', () => {
      signIn();
      authStoreStub.refresh
        .mockReturnValueOnce(of({ accessToken: 'first-token' }))
        .mockReturnValueOnce(of({ accessToken: 'second-token' }));
      const renewal = service.renewAccessToken();
      const firstNext = vi.fn();
      const secondNext = vi.fn();

      renewal.subscribe(firstNext);
      renewal.subscribe(secondNext);

      expect(authStoreStub.refresh).toHaveBeenCalledTimes(2);
      expect(firstNext).toHaveBeenCalledExactlyOnceWith('first-token');
      expect(secondNext).toHaveBeenCalledExactlyOnceWith('second-token');
      expect(service.accessToken()).toBe('second-token');
    });

    it('should cancel all shared subscribers on local cleanup and allow renewal in the next session', () => {
      signIn();
      const pending = new Subject<LoginResponse>();
      authStoreStub.refresh.mockReturnValue(pending.asObservable());
      const firstComplete = vi.fn();
      const secondComplete = vi.fn();
      const next = vi.fn();
      service.renewAccessToken().subscribe({ next, complete: firstComplete });
      service.renewAccessToken().subscribe({ next, complete: secondComplete });

      service.clearSession();

      expect(pending.observed).toBe(false);
      expect(firstComplete).toHaveBeenCalledTimes(1);
      expect(secondComplete).toHaveBeenCalledTimes(1);
      pending.next({ accessToken: 'late-token' });
      expect(next).not.toHaveBeenCalled();
      signIn('new-session-token');
      authStoreStub.refresh.mockReturnValue(of({ accessToken: 'new-renewal-token' }));
      service.renewAccessToken().subscribe(next);
      expect(authStoreStub.refresh).toHaveBeenCalledTimes(2);
      expect(next).toHaveBeenCalledExactlyOnceWith('new-renewal-token');
    });

    it('should time out after ten seconds, unsubscribe and allow another attempt', () => {
      vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
      try {
        signIn();
        const pending = new Subject<LoginResponse>();
        authStoreStub.refresh.mockReturnValue(pending.asObservable());
        const error = vi.fn();
        service.renewAccessToken().subscribe({ error });

        vi.advanceTimersByTime(9_999);
        expect(error).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(error).toHaveBeenCalledTimes(1);
        expect(error.mock.calls[0][0]).toMatchObject({ name: 'TimeoutError' });
        expect(pending.observed).toBe(false);
        expect(service.accessToken()).toBe('previous-token');

        authStoreStub.refresh.mockReturnValue(of({ accessToken: 'retry-token' }));
        const next = vi.fn();
        service.renewAccessToken().subscribe({ next });
        expect(next).toHaveBeenCalledExactlyOnceWith('retry-token');
      } finally {
        service.clearSession();
        vi.useRealTimers();
      }
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

  describe('automatic interceptor renewal', () => {
    const firstUrl = 'http://localhost:3000/service-requests/sent';
    const secondUrl = 'http://localhost:3000/service-requests/unread-message-counts';
    const thirdUrl = 'http://localhost:3000/service-requests/3/messages';

    it('should share one cookie refresh across three simultaneous 401s and retry each request with the new token', () => {
      signIn();
      const client = TestBed.inject(HttpClient);
      const urls = [firstUrl, secondUrl, thirdUrl];
      const subscribers = urls.map(() => vi.fn());
      urls.forEach((requestUrl, index) => client.get(requestUrl).subscribe(subscribers[index]));
      const originals = urls.map((requestUrl) => http.expectOne(requestUrl));
      for (const original of originals) {
        expect(original.request.headers.get('Authorization')).toBe('Bearer test-access-token');
        original.flush(null, { status: 401, statusText: 'Unauthorized' });
      }

      const refresh = http.expectOne(`${url}/refresh`);
      expect(refresh.request.withCredentials).toBe(true);
      expect(refresh.request.headers.has('Authorization')).toBe(false);
      expect(session.currentUser()).toEqual(user);
      refresh.flush({ accessToken: 'shared-renewed-token' });

      urls.forEach((requestUrl, index) => {
        const retry = http.expectOne(requestUrl);
        expect(retry.request.headers.get('Authorization')).toBe('Bearer shared-renewed-token');
        retry.flush({ result: index });
        expect(subscribers[index]).toHaveBeenCalledExactlyOnceWith({ result: index });
      });
      expect(session.accessToken()).toBe('shared-renewed-token');
      expect(session.currentUser()).toEqual(user);
      expect(session.isLoading()).toBe(false);
      http.expectNone(`${url}/refresh`);
      http.expectNone(`${url}/me`);
      http.expectNone(`${url}/logout`);
    });

    it('should reuse the renewed token for an original request whose 401 arrives after refresh completed', () => {
      signIn();
      const client = TestBed.inject(HttpClient);
      const firstNext = vi.fn();
      const secondNext = vi.fn();
      client.get(firstUrl).subscribe(firstNext);
      client.get(secondUrl).subscribe(secondNext);
      const first = http.expectOne(firstUrl);
      const second = http.expectOne(secondUrl);
      first.flush(null, { status: 401, statusText: 'Unauthorized' });
      http.expectOne(`${url}/refresh`).flush({ accessToken: 'renewed-token' });
      const firstRetry = http.expectOne(firstUrl);
      expect(firstRetry.request.headers.get('Authorization')).toBe('Bearer renewed-token');
      firstRetry.flush([]);

      second.flush(null, { status: 401, statusText: 'Unauthorized' });

      const secondRetry = http.expectOne(secondUrl);
      expect(secondRetry.request.headers.get('Authorization')).toBe('Bearer renewed-token');
      secondRetry.flush({ total: 0 });
      expect(firstNext).toHaveBeenCalledExactlyOnceWith([]);
      expect(secondNext).toHaveBeenCalledExactlyOnceWith({ total: 0 });
      http.expectNone(`${url}/refresh`);
      expect(session.isAuthenticated()).toBe(true);
    });

    it.each([401, 500])(
      'should forward refresh HTTP %s to all waiting requests and clear local identity without server logout',
      (status) => {
        signIn();
        const client = TestBed.inject(HttpClient);
        const errors = [vi.fn(), vi.fn()];
        client.get(firstUrl).subscribe({ error: errors[0] });
        client.get(secondUrl).subscribe({ error: errors[1] });
        http.expectOne(firstUrl).flush(null, { status: 401, statusText: 'Unauthorized' });
        http.expectOne(secondUrl).flush(null, { status: 401, statusText: 'Unauthorized' });

        http
          .expectOne(`${url}/refresh`)
          .flush({ message: 'Refresh failed' }, { status, statusText: 'Refresh failed' });

        for (const error of errors) {
          expect(error).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ status, error: { message: 'Refresh failed' } }),
          );
        }
        expect(session.accessToken()).toBeNull();
        expect(session.currentUser()).toBeNull();
        expect(session.reauthenticationRequired()).toBe(true);
        expect(session.errorMessage()).toBe(
          'Votre session ne peut plus être utilisée. Veuillez vous reconnecter.',
        );
        http.expectNone(`${url}/refresh`);
        http.expectNone(`${url}/logout`);
        http.expectNone(firstUrl);
        http.expectNone(secondUrl);
      },
    );

    it.each([401, 403, 500])(
      'should stop after a retried request returns HTTP %s and clear identity only for 401',
      (status) => {
        signIn();
        const error = vi.fn();
        TestBed.inject(HttpClient).get(firstUrl).subscribe({ error });
        http.expectOne(firstUrl).flush(null, { status: 401, statusText: 'Unauthorized' });
        http.expectOne(`${url}/refresh`).flush({ accessToken: 'renewed-token' });
        const retry = http.expectOne(firstUrl);
        expect(retry.request.headers.get('Authorization')).toBe('Bearer renewed-token');

        retry.flush(null, { status, statusText: 'Retry failed' });

        expect(error).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status }));
        expect(session.isAuthenticated()).toBe(status !== 401);
        expect(session.reauthenticationRequired()).toBe(status === 401);
        http.expectNone(`${url}/refresh`);
        http.expectNone(`${url}/logout`);
        http.expectNone(firstUrl);
      },
    );

    it('should cancel renewal and avoid replaying the request when the user logs out', () => {
      signIn();
      const next = vi.fn();
      const complete = vi.fn();
      TestBed.inject(HttpClient).get(firstUrl).subscribe({ next, complete });
      http.expectOne(firstUrl).flush(null, { status: 401, statusText: 'Unauthorized' });
      const refresh = http.expectOne(`${url}/refresh`);

      session.logout();

      expect(refresh.cancelled).toBe(true);
      expect(complete).toHaveBeenCalledTimes(1);
      expect(next).not.toHaveBeenCalled();
      http.expectOne(`${url}/logout`).flush(null, { status: 204, statusText: 'No Content' });
      expect(session.isAuthenticated()).toBe(false);
      http.expectNone(firstUrl);
    });

    it('should cancel the old renewal before a new login and never retry the old request in that session', () => {
      signIn();
      const next = vi.fn();
      const complete = vi.fn();
      TestBed.inject(HttpClient).get(firstUrl).subscribe({ next, complete });
      http.expectOne(firstUrl).flush(null, { status: 401, statusText: 'Unauthorized' });
      const refresh = http.expectOne(`${url}/refresh`);

      session.login(credentials);

      expect(refresh.cancelled).toBe(true);
      expect(complete).toHaveBeenCalledTimes(1);
      http.expectOne(`${url}/login`).flush({ accessToken: 'new-login-token' });
      http.expectOne(`${url}/me`).flush({ ...user });
      expect(next).not.toHaveBeenCalled();
      expect(session.accessToken()).toBe('new-login-token');
      expect(session.isAuthenticated()).toBe(true);
      http.expectNone(firstUrl);
      http.expectNone(`${url}/refresh`);
    });

    it('should ignore an old request 401 after another login even when it is the same account', () => {
      signIn();
      const error = vi.fn();
      TestBed.inject(HttpClient).get(firstUrl).subscribe({ error });
      const oldRequest = http.expectOne(firstUrl);
      session.login(credentials);
      http.expectOne(`${url}/login`).flush({ accessToken: 'new-login-token' });
      http.expectOne(`${url}/me`).flush({ ...user });

      oldRequest.flush(null, { status: 401, statusText: 'Unauthorized' });

      expect(error).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ status: 401 }));
      expect(session.accessToken()).toBe('new-login-token');
      expect(session.isAuthenticated()).toBe(true);
      http.expectNone(firstUrl);
      http.expectNone(`${url}/refresh`);
      http.expectNone(`${url}/logout`);
    });

    it('should time out a pending renewal, clear local identity and forward the timeout without retrying', () => {
      vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
      try {
        signIn();
        const error = vi.fn();
        TestBed.inject(HttpClient).get(firstUrl).subscribe({ error });
        http.expectOne(firstUrl).flush(null, { status: 401, statusText: 'Unauthorized' });
        const refresh = http.expectOne(`${url}/refresh`);
        vi.advanceTimersByTime(9_999);
        expect(error).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(error).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ name: 'TimeoutError' }),
        );
        expect(refresh.cancelled).toBe(true);
        expect(session.isAuthenticated()).toBe(false);
        expect(session.reauthenticationRequired()).toBe(true);
        http.expectNone(firstUrl);
        http.expectNone(`${url}/logout`);
      } finally {
        session.clearSession();
        vi.useRealTimers();
      }
    });
  });

  it('should send one cookie refresh request for three renewal subscribers and emit the same token to each', () => {
    signIn();
    const subscribers = [vi.fn(), vi.fn(), vi.fn()];
    for (const next of subscribers) {
      session.renewAccessToken().subscribe(next);
    }

    const refresh = http.expectOne(`${url}/refresh`);
    expect(refresh.request.method).toBe('POST');
    expect(refresh.request.withCredentials).toBe(true);
    expect(refresh.request.headers.has('Authorization')).toBe(false);
    expect(refresh.request.body).toEqual({});
    refresh.flush({ accessToken: 'shared-http-token' });

    for (const next of subscribers) {
      expect(next).toHaveBeenCalledExactlyOnceWith('shared-http-token');
    }
    expect(session.accessToken()).toBe('shared-http-token');
    expect(session.currentUser()).toEqual(user);
    http.expectNone(`${url}/me`);
    http.expectNone(`${url}/refresh`);
    http.expectNone(`${url}/logout`);
  });

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
