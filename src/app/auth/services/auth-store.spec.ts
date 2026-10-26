import { TestBed } from '@angular/core/testing';
import { AuthStore } from './auth-store';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpErrorResponse } from '@angular/common/http';
import type {
  CurrentUserResponse,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
} from '../../models/auth.model';

describe('AuthStore', () => {
  let service: AuthStore;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthStore);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should send login credentials with cookies and return an access token', () => {
    const loginRequest: LoginRequest = {
      email: 'alicemartin@example.com',
      password: 'un-mot-de-passe-d-au-moins-15-caracteres',
    };
    const mockReponse = {
      accessToken: 'fake-token',
    };

    let receivedResponse: LoginResponse | undefined;

    service.login(loginRequest).subscribe((response) => (receivedResponse = response));

    const request = httpTesting.expectOne('http://localhost:3000/auth/login');

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(loginRequest);
    expect(request.request.withCredentials).toBe(true);
    request.flush(mockReponse);
    expect(receivedResponse).toEqual(mockReponse);
  });

  it('should send registration data and complete successfully', () => {
    const registerRequest: RegisterRequest = {
      firstName: 'ALice',
      lastName: 'Martin',
      email: 'alicemartin@example.com',
      password: 'un-mot-de-passe-d-au-moins-15-caracteres',
    };

    let registrationCompleted = false;

    service.register(registerRequest).subscribe({
      complete: () => {
        registrationCompleted = true;
      },
    });

    const request = httpTesting.expectOne('http://localhost:3000/auth/register');

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(registerRequest);
    expect(request.request.withCredentials).toBe(false);
    request.flush(null, { status: 201, statusText: 'Created' });
    expect(registrationCompleted).toBe(true);
  });

  it('should fetch the current user with a bearer token', () => {
    const accessToken = 'fake-token';
    const mockReponse: CurrentUserResponse = {
      id: 1,
      firstName: 'ALice',
      lastName: 'Martin',
      email: 'alicemartin@example.com',
    };

    let receivedResponse: CurrentUserResponse | undefined;

    service.getCurrentUser(accessToken).subscribe((response) => (receivedResponse = response));

    const request = httpTesting.expectOne('http://localhost:3000/auth/me');

    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('Authorization')).toBe(`Bearer ${accessToken}`);
    expect(request.request.withCredentials).toBe(false);
    request.flush(mockReponse);
    expect(receivedResponse).toEqual(mockReponse);
  });
  describe('refresh', () => {
    it('should request a renewed access token using cookies and an empty body', () => {
      const token: LoginResponse = { accessToken: 'renewed-access-token' };
      const next = vi.fn();
      service.refresh().subscribe(next);

      const request = httpTesting.expectOne('http://localhost:3000/auth/refresh');
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({});
      expect(request.request.withCredentials).toBe(true);
      expect(next).not.toHaveBeenCalled();
      request.flush(token);
      expect(next).toHaveBeenCalledExactlyOnceWith(token);
    });

    it.each([
      { status: 401, statusText: 'Unauthorized' },
      { status: 403, statusText: 'Forbidden' },
      { status: 500, statusText: 'Internal Server Error' },
    ])('should propagate a renewal failure without retrying: $status', ({ status, statusText }) => {
      let receivedError: HttpErrorResponse | undefined;
      const next = vi.fn();
      service.refresh().subscribe({
        next,
        error: (error: HttpErrorResponse) => {
          receivedError = error;
        },
      });

      const request = httpTesting.expectOne('http://localhost:3000/auth/refresh');
      request.flush({ message: 'Renewal failed' }, { status, statusText });

      expect(receivedError).toBeInstanceOf(HttpErrorResponse);
      expect(receivedError?.status).toBe(status);
      expect(next).not.toHaveBeenCalled();
      httpTesting.expectNone('http://localhost:3000/auth/refresh');
    });
  });

  describe('logout', () => {
    it('should send cookies with an empty body and complete after a 204 response', () => {
      const complete = vi.fn();
      const error = vi.fn();
      service.logout().subscribe({ complete, error });

      const request = httpTesting.expectOne('http://localhost:3000/auth/logout');
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({});
      expect(request.request.withCredentials).toBe(true);
      expect(complete).not.toHaveBeenCalled();
      request.flush(null, { status: 204, statusText: 'No Content' });

      expect(complete).toHaveBeenCalledOnce();
      expect(error).not.toHaveBeenCalled();
    });

    it('should propagate a logout failure without reporting completion or retrying', () => {
      let receivedError: HttpErrorResponse | undefined;
      const complete = vi.fn();
      service.logout().subscribe({
        complete,
        error: (error: HttpErrorResponse) => {
          receivedError = error;
        },
      });
      const request = httpTesting.expectOne('http://localhost:3000/auth/logout');
      request.flush(
        { message: 'Revocation failed' },
        { status: 500, statusText: 'Internal Server Error' },
      );

      expect(receivedError).toBeInstanceOf(HttpErrorResponse);
      expect(receivedError?.status).toBe(500);
      expect(complete).not.toHaveBeenCalled();
      httpTesting.expectNone('http://localhost:3000/auth/logout');
    });
  });
});
