import { TestBed } from '@angular/core/testing';
import { AuthSession } from './auth-session';
import { AuthStore } from './auth-store';
import { NEVER, of, Subject, throwError } from 'rxjs';
import type { CurrentUserResponse } from '../../models/auth.model';

describe('AuthSession', () => {
  const authStoreStub = {
    login: vi.fn(),
    getCurrentUser: vi.fn(),
  };

  let service: InstanceType<typeof AuthSession>;

  beforeEach(() => {
    authStoreStub.login.mockReset().mockReturnValue(NEVER);
    authStoreStub.getCurrentUser.mockReset();
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
});
