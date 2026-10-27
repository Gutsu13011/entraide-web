import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LoginForm } from './login-form';
import { AuthSession } from '../../services/auth-session';
import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';

describe('LoginForm', () => {
  const authSessionStub = {
    login: vi.fn(),
    isLoading: signal(false),
    errorMessage: signal<string | null>(null),
    isAuthenticated: signal<boolean>(false),
  };
  const routeStub = { snapshot: { queryParamMap: convertToParamMap({}) } };
  let router: Router;

  let component: LoginForm;
  let fixture: ComponentFixture<LoginForm>;

  beforeEach(async () => {
    authSessionStub.login.mockReset();
    authSessionStub.isLoading.set(false);
    authSessionStub.errorMessage.set(null);
    authSessionStub.isAuthenticated.set(false);
    routeStub.snapshot.queryParamMap = convertToParamMap({});

    await TestBed.configureTestingModule({
      imports: [LoginForm],
      providers: [
        { provide: AuthSession, useValue: authSessionStub },
        provideRouter([]),
        { provide: ActivatedRoute, useValue: routeStub },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(LoginForm);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should not attempt login when the form is invalid', () => {
    component.onSubmit();
    expect(authSessionStub.login).not.toHaveBeenCalled();
    expect(component.loginForm.controls.email.touched).toBe(true);
    expect(component.loginForm.controls.password.touched).toBe(true);
  });

  it('should submit valid credentials without changing the password', () => {
    const credentials = {
      email: 'alice@example.com',
      password: ' mot de passe avec espaces ',
    };

    component.loginForm.setValue(credentials);
    expect(component.loginForm.valid).toBe(true);
    component.onSubmit();
    expect(authSessionStub.login).toHaveBeenCalledTimes(1);
    expect(authSessionStub.login).toHaveBeenCalledWith(credentials);
  });

  it('should not submit credentials while a login is loading', () => {
    const credentials = {
      email: 'alice@example.com',
      password: ' mot de passe avec espaces ',
    };

    component.loginForm.setValue(credentials);
    expect(component.loginForm.valid).toBe(true);
    authSessionStub.isLoading.set(true);
    component.onSubmit();
    expect(authSessionStub.login).not.toHaveBeenCalled();
  });

  it('should render email and password inputs with the correct types', () => {
    const emailInput = fixture.nativeElement.querySelector('#email') as HTMLInputElement;
    const passwordInput = fixture.nativeElement.querySelector('#password') as HTMLInputElement;

    expect(emailInput.type).toBe('email');
    expect(passwordInput.type).toBe('password');
  });

  it('should show required field messages after an empty submission', () => {
    let text = fixture.nativeElement.textContent;

    expect(text).not.toContain("L'email est obligatoire");
    expect(text).not.toContain('Le mot de passe est obligatoire');
    component.onSubmit();
    fixture.detectChanges();
    text = fixture.nativeElement.textContent;
    expect(text).toContain("L'email est obligatoire");
    expect(text).toContain('Le mot de passe est obligatoire');
  });

  it('should display login errors from the session', () => {
    let errorMessage = fixture.nativeElement.querySelector('[role="alert"]');

    expect(errorMessage).toBe(null);
    authSessionStub.errorMessage.set('Connexion impossible. Veuillez réessayer.');
    fixture.detectChanges();
    errorMessage = fixture.nativeElement.querySelector('[role="alert"]');
    expect(errorMessage.textContent).toBe('Connexion impossible. Veuillez réessayer.');
  });

  async function openLoginWithDestination(destination: string | null) {
    fixture.destroy();
    routeStub.snapshot.queryParamMap = convertToParamMap(
      destination === null ? {} : { returnUrl: destination },
    );
    fixture = TestBed.createComponent(LoginForm);
    component = fixture.componentInstance;
    await fixture.whenStable();
  }

  it.each([
    '/service-requests/sent',
    '/service-requests/received?filter=pending&search=Alice%20Martin#latest',
    '/service-providers/7/service-offerings/12/service-requests/new',
    '/',
  ])(
    'should navigate to the internal destination %s only after authentication',
    async (destination) => {
      await openLoginWithDestination(destination);
      expect(router.navigateByUrl).not.toHaveBeenCalled();

      authSessionStub.isAuthenticated.set(true);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(router.navigateByUrl).toHaveBeenCalledExactlyOnceWith(router.parseUrl(destination), {
        replaceUrl: true,
      });
    },
  );

  it.each([
    { label: 'an absent destination', destination: null },
    { label: 'an empty destination', destination: '' },
    { label: 'an external URL', destination: 'https://example.test/service-requests/sent' },
    { label: 'a protocol-relative URL', destination: '//example.test/service-requests/sent' },
    { label: 'a relative path', destination: 'service-requests/sent' },
    { label: 'a path containing a backslash', destination: '/service-requests\\sent' },
    { label: 'the login page', destination: '/login' },
    {
      label: 'login with query parameters',
      destination: '/login?returnUrl=%2Fservice-requests%2Fsent',
    },
    { label: 'login with matrix parameters', destination: '/login;source=test#form' },
    { label: 'an encoded login path', destination: '/%6Cogin' },
    { label: 'login in the explicit primary outlet', destination: '/(primary:login)' },
    { label: 'the registration page', destination: '/register?source=test' },
    { label: 'malformed percent encoding', destination: '/service-requests/%' },
  ])('should fall back to home for $label', async ({ destination }) => {
    await openLoginWithDestination(destination);
    authSessionStub.isAuthenticated.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(router.navigateByUrl).toHaveBeenCalledExactlyOnceWith(router.parseUrl('/'), {
      replaceUrl: true,
    });
  });

  it('should remain on login after failure and retain the requested destination for a successful retry', async () => {
    const destination = '/service-requests/sent?filter=pending#latest';
    await openLoginWithDestination(destination);
    component.loginForm.setValue({ email: 'alice@example.test', password: 'test-only-password' });
    component.onSubmit();
    authSessionStub.errorMessage.set('Connexion impossible. Veuillez réessayer.');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Connexion impossible',
    );

    component.onSubmit();
    authSessionStub.isAuthenticated.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(authSessionStub.login).toHaveBeenCalledTimes(2);
    expect(router.navigateByUrl).toHaveBeenCalledExactlyOnceWith(router.parseUrl(destination), {
      replaceUrl: true,
    });
  });

  it('should navigate to providers when the session becomes authenticated', async () => {
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    authSessionStub.isAuthenticated.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(router.navigateByUrl).toHaveBeenCalledTimes(1);
    expect(router.navigateByUrl).toHaveBeenCalledWith(router.parseUrl('/'), { replaceUrl: true });
  });
});
