import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LoginForm } from './login-form';
import { AuthSession } from '../../services/auth-session';
import { signal } from '@angular/core';
import { Router } from '@angular/router';

describe('LoginForm', () => {
  const authSessionStub = {
    login: vi.fn(),
    isLoading: signal(false),
    errorMessage: signal<string | null>(null),
    isAuthenticated: signal<boolean>(false),
  };
  const routerStub = {
    navigate: vi.fn(),
  };

  let component: LoginForm;
  let fixture: ComponentFixture<LoginForm>;

  beforeEach(async () => {
    authSessionStub.login.mockReset();
    authSessionStub.isLoading.set(false);
    authSessionStub.errorMessage.set(null);
    authSessionStub.isAuthenticated.set(false);
    routerStub.navigate.mockReset();

    await TestBed.configureTestingModule({
      imports: [LoginForm],
      providers: [
        { provide: AuthSession, useValue: authSessionStub },
        { provide: Router, useValue: routerStub },
      ],
    }).compileComponents();

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

  it('should navigate to providers when the session becomes authenticated', async () => {
    expect(routerStub.navigate).not.toHaveBeenCalled();
    authSessionStub.isAuthenticated.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(routerStub.navigate).toHaveBeenCalledTimes(1);
    expect(routerStub.navigate).toHaveBeenCalledWith(['/']);
  });
});
