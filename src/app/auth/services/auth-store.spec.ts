import { TestBed } from '@angular/core/testing';
import { AuthStore } from './auth-store';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
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

  it('should send login credentials and return an access token', () => {
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
    request.flush(mockReponse);
    expect(receivedResponse).toEqual(mockReponse);
  });
});
