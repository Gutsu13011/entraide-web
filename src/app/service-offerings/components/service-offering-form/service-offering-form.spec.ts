import { TestBed } from '@angular/core/testing';
import { ServiceOfferingForm } from './service-offering-form';
import {
  CreateServiceOffering,
  ServiceOffering,
  ServicePricingType,
} from '../../../models/service-offering.model';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ServiceOfferingStore } from '../../services/service-offering-store';
import { of } from 'rxjs';

describe('ServiceOfferingForm', () => {
  const serviceOfferingStoreStub = {
    add: vi.fn(),
  };

  let component: ServiceOfferingForm;
  let harness: RouterTestingHarness;
  let router: Router;

  beforeEach(async () => {
    serviceOfferingStoreStub.add.mockReset();
    await TestBed.configureTestingModule({
      imports: [ServiceOfferingForm],
      providers: [
        provideRouter([
          {
            path: 'service-providers/:id/service-offerings/new',
            component: ServiceOfferingForm,
          },
        ]),
        { provide: ServiceOfferingStore, useValue: serviceOfferingStoreStub },
      ],
    }).compileComponents();

    harness = await RouterTestingHarness.create();
    component = await harness.navigateByUrl(
      '/service-providers/7/service-offerings/new',
      ServiceOfferingForm,
    );
    router = TestBed.inject(Router);
  });

  it('should create', () => {
    expect(component.serviceProviderId).toBe(7);
    expect(component).toBeTruthy();
  });

  it('should require a rate only for hourly offerings', () => {
    harness.detectChanges();

    const formControl = component.serviceOfferingForm.controls;
    formControl.title.setValue('title');
    formControl.description.setValue('description');

    formControl.hourlyRate.setValue(null);
    expect(formControl.hourlyRate.invalid).toBe(true);
    expect(component.serviceOfferingForm.invalid).toBe(true);

    formControl.pricingType.setValue(ServicePricingType.FREE);
    expect(formControl.hourlyRate.value).toBe(null);
    expect(formControl.hourlyRate.valid).toBe(true);
    expect(component.serviceOfferingForm.valid).toBe(true);

    formControl.pricingType.setValue(ServicePricingType.HOURLY);
    expect(formControl.hourlyRate.invalid).toBe(true);
    expect(component.serviceOfferingForm.invalid).toBe(true);

    formControl.hourlyRate.setValue(29);
    expect(formControl.hourlyRate.valid).toBe(true);
    expect(component.serviceOfferingForm.valid).toBe(true);
  });

  it('should display hourlyRate input depending on pricingType', () => {
    const compiled = harness.routeNativeElement as HTMLElement;
    const formControl = component.serviceOfferingForm.controls;

    harness.detectChanges();

    expect(compiled.querySelector('#hourlyRate')).not.toBe(null);
    formControl.pricingType.setValue(ServicePricingType.FREE);
    harness.detectChanges();

    expect(compiled.querySelector('#hourlyRate')).toBe(null);
    formControl.pricingType.setValue(ServicePricingType.HOURLY);
    harness.detectChanges();

    expect(compiled.querySelector('#hourlyRate')).not.toBe(null);
  });

  it('should not call add and show errors', () => {
    component.onSubmit();
    expect(serviceOfferingStoreStub.add).not.toHaveBeenCalled();
    expect(component.serviceOfferingForm.controls.title.touched).toBe(true);
    expect(component.serviceOfferingForm.controls.description.touched).toBe(true);
  });

  it('should submit a free offering without an hourly rate', () => {
    const serviceOfferingFormMock: CreateServiceOffering = {
      title: 'titre',
      description: 'description',
      pricingType: ServicePricingType.FREE,
    };
    const serviceOfferingResponse: ServiceOffering = {
      id: 1,
      title: 'titre',
      description: 'description',
      pricingType: ServicePricingType.FREE,
      hourlyRate: null,
      serviceProviderId: 7,
    };
    serviceOfferingStoreStub.add.mockReturnValue(of(serviceOfferingResponse));
    component.serviceOfferingForm.controls.title.setValue(serviceOfferingFormMock.title);
    component.serviceOfferingForm.controls.description.setValue(
      serviceOfferingFormMock.description,
    );
    component.serviceOfferingForm.controls.pricingType.setValue(
      serviceOfferingFormMock.pricingType,
    );
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    component.onSubmit();
    expect(serviceOfferingStoreStub.add).toHaveBeenCalledWith(7, serviceOfferingFormMock);
    expect(navigateSpy).toHaveBeenCalledWith(['/service-providers', 7]);
  });

  it('should submit a service offering with an hourly rate', () => {
    const serviceOfferingFormMock: CreateServiceOffering = {
      title: 'titre',
      description: 'description',
      pricingType: ServicePricingType.HOURLY,
      hourlyRate: 29,
    };
    const serviceOfferingResponse: ServiceOffering = {
      id: 1,
      title: 'titre',
      description: 'description',
      pricingType: ServicePricingType.HOURLY,
      hourlyRate: 29,
      serviceProviderId: 7,
    };

    serviceOfferingStoreStub.add.mockReturnValue(of(serviceOfferingResponse));
    component.serviceOfferingForm.controls.title.setValue(serviceOfferingFormMock.title);
    component.serviceOfferingForm.controls.description.setValue(
      serviceOfferingFormMock.description,
    );
    component.serviceOfferingForm.controls.pricingType.setValue(
      serviceOfferingFormMock.pricingType,
    );
    component.serviceOfferingForm.controls.hourlyRate.setValue(serviceOfferingFormMock.hourlyRate);
    component.onSubmit();
    expect(serviceOfferingStoreStub.add).toHaveBeenCalledWith(7, serviceOfferingFormMock);
  });
});
