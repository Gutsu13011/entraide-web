import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ServiceProviderForm } from './service-provider-form';
import { provideRouter } from '@angular/router';
import { CurrentUserResponse } from '../../../models/auth.model';
import { AuthSession } from '../../../auth/services/auth-session';

describe('ServiceProviderForm', () => {
  let component: ServiceProviderForm;
  let fixture: ComponentFixture<ServiceProviderForm>;

  const authSessionStub = {
    currentUser: vi.fn(),
  };
  const currentUser: CurrentUserResponse = {
    id: 7,
    firstName: 'Alice',
    lastName: 'Martin',
    email: 'alicemartin@mail.com',
  };

  beforeEach(async () => {
    authSessionStub.currentUser.mockReset().mockReturnValue(currentUser);

    await TestBed.configureTestingModule({
      imports: [ServiceProviderForm],
      providers: [provideRouter([]), { provide: AuthSession, useValue: authSessionStub }],
    }).compileComponents();

    fixture = TestBed.createComponent(ServiceProviderForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should prefill read-only name fields from the authenticated account', () => {
    const firstNameControl = component.serviceProviderForm.controls.firstName;
    const firstNameHtml = fixture.nativeElement.querySelector('#firstName');
    const lastNameControl = component.serviceProviderForm.controls.lastName;
    const lastNameHtml = fixture.nativeElement.querySelector('#lastName');

    expect(firstNameControl.value).toBe('Alice');
    expect(lastNameControl.value).toBe('Martin');
    expect(firstNameHtml.readOnly).toBe(true);
    expect(lastNameHtml.readOnly).toBe(true);
  });

  it('should validate the first name', () => {
    const firstNameControl = component.serviceProviderForm.controls.firstName;

    firstNameControl.setValue('');
    expect(firstNameControl.hasError('required')).toBe(true);
    firstNameControl.setValue('J');
    expect(firstNameControl.hasError('minlength')).toBe(true);
    firstNameControl.setValue('John');
    expect(firstNameControl.valid).toBe(true);
  });

  it('should require a positive hourly rate', () => {
    const hourlyRateControl = component.serviceProviderForm.controls.hourlyRate;

    expect(hourlyRateControl.hasError('required')).toBe(true);
    hourlyRateControl.setValue(-1);
    expect(hourlyRateControl.invalid).toBe(true);
    hourlyRateControl.setValue(0);
    expect(hourlyRateControl.invalid).toBe(true);
    hourlyRateControl.setValue(45.5);
    expect(hourlyRateControl.valid).toBe(true);
  });
});
