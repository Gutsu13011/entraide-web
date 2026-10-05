import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthSession } from './auth/services/auth-session';
import { LoginForm } from './auth/components/login-form/login-form';

describe('App routes', () => {
  const authSessionStub = {
    isAuthenticated: signal<boolean>(false),
    isLoading: signal<boolean>(false),
    errorMessage: signal<string | null>(null),
    login: vi.fn(),
  };

  let harness: RouterTestingHarness;
  let router: Router;

  beforeEach(async () => {
    authSessionStub.isAuthenticated.set(false);
    authSessionStub.isLoading.set(false);
    authSessionStub.errorMessage.set(null);
    authSessionStub.login.mockReset();

    await TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideHttpClientTesting(),
        { provide: AuthSession, useValue: authSessionStub },
      ],
    }).compileComponents();

    harness = await RouterTestingHarness.create();
    router = TestBed.inject(Router);
  });

  it('should redirect unauthenticated users from provider creation to login', async () => {
    await harness.navigateByUrl('/service-providers/new', LoginForm);
    expect(router.url).toBe('/login');
  });

  it('should redirect unauthenticated users from offering creation to login', async () => {
    await harness.navigateByUrl('/service-providers/7/service-offerings/new', LoginForm);
    expect(router.url).toBe('/login');
  });
});
