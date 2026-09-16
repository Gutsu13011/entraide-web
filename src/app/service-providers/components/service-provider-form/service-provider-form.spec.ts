import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ServiceProviderForm } from './service-provider-form';
import { provideRouter } from '@angular/router';

describe('ServiceProviderForm', () => {
  let component: ServiceProviderForm;
  let fixture: ComponentFixture<ServiceProviderForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ServiceProviderForm],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ServiceProviderForm);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should validate the first name', () => {
    const firstNameControl = component.serviceProviderForm.controls.firstName;
    expect(firstNameControl.hasError('required')).toBe(true);
    firstNameControl.setValue('J');
    expect(firstNameControl.hasError('minlength')).toBe(true);
    firstNameControl.setValue('John');
    expect(firstNameControl.valid).toBe(true);
  });
});
