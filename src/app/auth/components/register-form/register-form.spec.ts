import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RegisterForm } from './register-form';
import { finalize, of, Subject, throwError } from 'rxjs';
import { AuthStore } from '../../services/auth-store';
import { Router } from '@angular/router';

describe('RegisterForm', () => {
  const authStoreStub = {
    register: vi.fn(),
  };
  const routerStub = {
    navigate: vi.fn(),
  };

  let component: RegisterForm;
  let fixture: ComponentFixture<RegisterForm>;

  beforeEach(async () => {
    authStoreStub.register.mockReset().mockReturnValue(of(undefined));
    routerStub.navigate.mockReset();

    await TestBed.configureTestingModule({
      imports: [RegisterForm],
      providers: [
        { provide: AuthStore, useValue: authStoreStub },
        { provide: Router, useValue: routerStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RegisterForm);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should reject passwords shorter than 15 characters', () => {
    const formControl = component.registerForm.controls;

    formControl.firstName.setValue('Alice');
    formControl.lastName.setValue('Martin');
    formControl.email.setValue('alicemarting@mail.com');
    formControl.password.setValue('a'.repeat(14));
    expect(formControl.password.hasError('minlength')).toBe(true);
    expect(component.registerForm.invalid).toBe(true);
    formControl.password.setValue('a'.repeat(15));
    expect(formControl.password.hasError('minlength')).toBe(false);
    expect(component.registerForm.valid).toBe(true);
  });

  it('should mark all fields as touched when submitting an invalid form', () => {
    expect(component.registerForm.controls.email.touched).toBe(false);
    component.onSubmit();
    expect(component.registerForm.controls.firstName.touched).toBe(true);
    expect(component.registerForm.controls.lastName.touched).toBe(true);
    expect(component.registerForm.controls.email.touched).toBe(true);
    expect(component.registerForm.controls.password.touched).toBe(true);
    expect(component.isSubmitting()).toBe(false);
  });

  it('should submit valid registration data', () => {
    const data = {
      firstName: 'Alice',
      lastName: 'Martin',
      email: 'alicemartin@mail.com',
      password: 'a'.repeat(15),
    };

    component.registerForm.setValue(data);
    component.onSubmit();
    expect(authStoreStub.register).toHaveBeenCalledTimes(1);
    expect(authStoreStub.register).toHaveBeenCalledWith(data);
    expect(routerStub.navigate).toHaveBeenCalledTimes(1);
    expect(routerStub.navigate).toHaveBeenCalledWith(['/login']);
    expect(component.isSubmitting()).toBe(false);
  });

  it('should show an error and stop submitting when registration fails', () => {
    const data = {
      firstName: 'Alice',
      lastName: 'Martin',
      email: 'alicemartin@mail.com',
      password: 'a'.repeat(15),
    };

    component.registerForm.setValue(data);
    authStoreStub.register.mockReturnValue(throwError(() => new Error('Registration failed')));
    component.onSubmit();
    expect(component.submitError()).toBe('Inscription impossible. Veuillez réessayer.');
    expect(component.isSubmitting()).toBe(false);
    expect(routerStub.navigate).not.toHaveBeenCalled();
  });

  it.each(['success', 'error'] as const)(
    'should cancel pending registration on destruction and ignore a late %s',
    (response) => {
      const registrationResponse = new Subject<void>();
      const requestFinalized = vi.fn();
      authStoreStub.register.mockReturnValue(registrationResponse.pipe(finalize(requestFinalized)));
      component.registerForm.setValue({
        firstName: 'Alice',
        lastName: 'Martin',
        email: 'alicemartin@mail.com',
        password: 'a'.repeat(15),
      });

      component.onSubmit();

      expect(authStoreStub.register).toHaveBeenCalledTimes(1);
      expect(component.isSubmitting()).toBe(true);
      expect(requestFinalized).not.toHaveBeenCalled();
      expect(routerStub.navigate).not.toHaveBeenCalled();

      fixture.destroy();

      expect(requestFinalized).toHaveBeenCalledTimes(1);
      expect(component.isSubmitting()).toBe(false);

      if (response === 'success') {
        registrationResponse.next(undefined);
        registrationResponse.complete();
      } else {
        registrationResponse.error(new Error('Late registration failure'));
      }

      expect(routerStub.navigate).not.toHaveBeenCalled();
      expect(component.submitError()).toBeNull();
      expect(requestFinalized).toHaveBeenCalledTimes(1);
    },
  );

  it('should update the email control when typing in the email input', () => {
    fixture.detectChanges();

    const emailInput = fixture.nativeElement.querySelector('#email') as HTMLInputElement;

    emailInput.value = 'alicemartin@mail.com';
    emailInput.dispatchEvent(new Event('input'));
    expect(component.registerForm.controls.email.value).toBe('alicemartin@mail.com');
  });
});
