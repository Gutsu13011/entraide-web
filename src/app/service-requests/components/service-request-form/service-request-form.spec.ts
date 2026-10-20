import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { ServiceRequestForm } from './service-request-form';
import { HttpErrorResponse } from '@angular/common/http';
import { of, Subject, throwError } from 'rxjs';
import { ServiceOfferingStore } from '../../../service-offerings/services/service-offering-store';
import { ServiceOffering, ServicePricingType } from '../../../models/service-offering.model';
import { ServiceRequestStore } from '../../services/service-request-store';
import { ServiceRequest, ServiceRequestStatus } from '../../../models/service-request.model';

describe('ServiceRequestForm', () => {
  let component: ServiceRequestForm;
  let fixture: ComponentFixture<ServiceRequestForm>;
  const serviceOfferingStoreStub = { getAll: vi.fn() };
  const serviceRequestStoreStub = { add: vi.fn() };
  let router: Router;
  const hourlyOffering: ServiceOffering = {
    id: 12,
    serviceProviderId: 7,
    title: 'Peinture',
    description: 'Peinture intérieure.',
    pricingType: ServicePricingType.HOURLY,
    hourlyRate: 35,
  };

  const message = 'Bonjour, je souhaite repeindre ma chambre.';
  const createdRequest: ServiceRequest = {
    id: 42,
    message,
    status: ServiceRequestStatus.SENT,
    createdAt: '2026-10-12T10:30:00.000Z',
    requesterUserId: 8,
    recipientUserId: 9,
    serviceOfferingId: 12,
    serviceProviderId: 7,
    offeringTitleSnapshot: hourlyOffering.title,
    offeringPricingTypeSnapshot: ServicePricingType.HOURLY,
    offeringHourlyRateSnapshot: 35,
    requester: { id: 8, firstName: 'Alice', lastName: 'Martin' },
    recipient: { id: 9, firstName: 'Bruno', lastName: 'Leroy' },
  };

  function createForm() {
    fixture = TestBed.createComponent(ServiceRequestForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    serviceOfferingStoreStub.getAll.mockReset().mockReturnValue(of([hourlyOffering]));
    serviceRequestStoreStub.add.mockReset().mockReturnValue(of(createdRequest));
    await TestBed.configureTestingModule({
      imports: [ServiceRequestForm],
      providers: [
        provideRouter([]),
        { provide: ServiceRequestStore, useValue: serviceRequestStoreStub },
        { provide: ServiceOfferingStore, useValue: serviceOfferingStoreStub },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ id: '7', offeringId: '12' }) },
          },
        },
      ],
    }).compileComponents();
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should read the provider and offering route ids as numbers', () => {
    createForm();
    expect(component.serviceProviderId).toBe(7);
    expect(component.serviceOfferingId).toBe(12);
  });

  it('should start with an empty untouched message and no submission in progress or error', () => {
    createForm();
    expect(component.serviceRequestForm.getRawValue()).toEqual({ message: '' });
    expect(component.serviceRequestForm.controls.message.touched).toBe(false);
    expect(component.isSubmitting()).toBe(false);
    expect(component.submitError()).toBeNull();
  });

  it.each([
    { label: 'an empty message', message: '', error: 'required' },
    { label: 'spaces only', message: '   ', error: 'pattern' },
    { label: 'line breaks and tabs only', message: '\n\t', error: 'pattern' },
  ])('should reject $label', ({ message, error }) => {
    createForm();
    component.serviceRequestForm.controls.message.setValue(message);

    expect(component.serviceRequestForm.invalid).toBe(true);
    expect(component.serviceRequestForm.controls.message.hasError(error)).toBe(true);
  });

  it.each(['Bonjour, je souhaite repeindre ma chambre.', 'x'])(
    'should accept a message containing non-whitespace characters: %s',
    (message) => {
      createForm();
      component.serviceRequestForm.controls.message.setValue(message);

      expect(component.serviceRequestForm.valid).toBe(true);
      expect(component.serviceRequestForm.getRawValue()).toEqual({ message });
    },
  );

  it('should reset the message to an empty string instead of null', () => {
    createForm();
    component.serviceRequestForm.controls.message.setValue('Bonjour.');
    component.serviceRequestForm.controls.message.markAsTouched();

    component.serviceRequestForm.reset();

    expect(component.serviceRequestForm.getRawValue()).toEqual({ message: '' });
    expect(component.serviceRequestForm.controls.message.touched).toBe(false);
    expect(component.serviceRequestForm.invalid).toBe(true);
  });

  describe('offering loading', () => {
    it.each([
      { pricingType: ServicePricingType.HOURLY, hourlyRate: 35 },
      { pricingType: ServicePricingType.FREE, hourlyRate: null },
    ])('should load the selected $pricingType offering from the provider list', (pricing) => {
      const selectedOffering = { ...hourlyOffering, ...pricing };
      const otherOffering = { ...hourlyOffering, id: 7, title: 'Autre offre' };
      serviceOfferingStoreStub.getAll.mockReturnValue(of([otherOffering, selectedOffering]));

      createForm();

      expect(serviceOfferingStoreStub.getAll).toHaveBeenCalledExactlyOnceWith(7);
      expect(component.serviceOffering()).toEqual(selectedOffering);
      expect(component.isLoading()).toBe(false);
      expect(component.loadError()).toBeNull();
      expect(component.serviceRequestForm.getRawValue()).toEqual({ message: '' });
    });

    it('should remain loading until the offering request completes', () => {
      const response$ = new Subject<ServiceOffering[]>();
      serviceOfferingStoreStub.getAll.mockReturnValue(response$);

      createForm();

      expect(component.isLoading()).toBe(true);
      expect(component.serviceOffering()).toBeNull();
      expect(component.loadError()).toBeNull();
      expect(serviceOfferingStoreStub.getAll).toHaveBeenCalledExactlyOnceWith(7);

      response$.next([hourlyOffering]);
      expect(component.serviceOffering()).toEqual(hourlyOffering);
      expect(component.isLoading()).toBe(true);

      response$.complete();
      expect(component.isLoading()).toBe(false);
      expect(component.loadError()).toBeNull();
    });

    it.each([
      { label: 'the list is empty', offerings: [] },
      { label: 'only another offering is present', offerings: [{ ...hourlyOffering, id: 13 }] },
    ])('should report an unavailable offering when $label', ({ offerings }) => {
      serviceOfferingStoreStub.getAll.mockReturnValue(of(offerings));

      createForm();

      expect(component.serviceOffering()).toBeNull();
      expect(component.isLoading()).toBe(false);
      expect(component.loadError()).toBe('Cette offre de service est introuvable.');
    });

    it('should report an HTTP loading error and stop showing progress', () => {
      const response$ = new Subject<ServiceOffering[]>();
      serviceOfferingStoreStub.getAll.mockReturnValue(response$);
      createForm();
      expect(component.isLoading()).toBe(true);

      response$.error(new HttpErrorResponse({ status: 500, statusText: 'Internal Server Error' }));

      expect(component.serviceOffering()).toBeNull();
      expect(component.isLoading()).toBe(false);
      expect(component.loadError()).toBe(
        'Impossible de charger cette offre de service. Veuillez réessayer.',
      );
    });
  });

  describe('request submission', () => {
    it.each(['loading', 'missing offering', 'loading error'] as const)(
      'should not submit a valid message when the offering is unavailable because of %s',
      (state) => {
        const loading$ = new Subject<ServiceOffering[]>();
        if (state === 'loading') serviceOfferingStoreStub.getAll.mockReturnValue(loading$);
        if (state === 'missing offering') serviceOfferingStoreStub.getAll.mockReturnValue(of([]));
        if (state === 'loading error') {
          serviceOfferingStoreStub.getAll.mockReturnValue(
            throwError(() => new HttpErrorResponse({ status: 500 })),
          );
        }
        createForm();
        component.serviceRequestForm.controls.message.setValue(message);
        expect(component.serviceRequestForm.valid).toBe(true);

        component.onSubmit();

        expect(serviceRequestStoreStub.add).not.toHaveBeenCalled();
        expect(router.navigate).not.toHaveBeenCalled();
        expect(component.isSubmitting()).toBe(false);
        loading$.complete();
      },
    );

    it.each(['', '   ', '\n\t'])(
      'should touch an invalid message and stop before calling the API: %j',
      (invalidMessage) => {
        createForm();
        component.serviceRequestForm.controls.message.setValue(invalidMessage);

        component.onSubmit();

        expect(component.serviceRequestForm.controls.message.touched).toBe(true);
        expect(serviceRequestStoreStub.add).not.toHaveBeenCalled();
        expect(router.navigate).not.toHaveBeenCalled();
        expect(component.isSubmitting()).toBe(false);
      },
    );

    it.each([
      { pricingType: ServicePricingType.HOURLY, hourlyRate: 35 },
      { pricingType: ServicePricingType.FREE, hourlyRate: null },
    ])(
      'should send only the message for a $pricingType offering and return to its provider after success',
      (pricing) => {
        serviceOfferingStoreStub.getAll.mockReturnValue(of([{ ...hourlyOffering, ...pricing }]));
        const response$ = new Subject<ServiceRequest>();
        serviceRequestStoreStub.add.mockReturnValue(response$);
        createForm();
        component.serviceRequestForm.controls.message.setValue(message);
        component.submitError.set('Previous error');

        component.onSubmit();

        expect(serviceRequestStoreStub.add).toHaveBeenCalledExactlyOnceWith(7, 12, { message });
        expect(component.isSubmitting()).toBe(true);
        expect(component.submitError()).toBeNull();
        expect(router.navigate).not.toHaveBeenCalled();

        response$.next({
          ...createdRequest,
          offeringPricingTypeSnapshot: pricing.pricingType,
          offeringHourlyRateSnapshot: pricing.hourlyRate,
        });
        expect(router.navigate).toHaveBeenCalledTimes(1);
        expect(component.isSubmitting()).toBe(true);
        response$.complete();

        expect(component.isSubmitting()).toBe(false);
        expect(component.submitError()).toBeNull();
        expect(router.navigate).toHaveBeenCalledExactlyOnceWith(['/service-providers', 7]);
      },
    );

    it('should ignore repeated submissions while the API response is pending', () => {
      const response$ = new Subject<ServiceRequest>();
      serviceRequestStoreStub.add.mockReturnValue(response$);
      createForm();
      component.serviceRequestForm.controls.message.setValue(message);

      component.onSubmit();
      component.onSubmit();

      expect(serviceRequestStoreStub.add).toHaveBeenCalledExactlyOnceWith(7, 12, { message });
      expect(component.isSubmitting()).toBe(true);
      expect(router.navigate).not.toHaveBeenCalled();
      response$.complete();
      expect(component.isSubmitting()).toBe(false);
    });

    it('should preserve the message after an HTTP failure and allow a successful retry', () => {
      const retry$ = new Subject<ServiceRequest>();
      serviceRequestStoreStub.add
        .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })))
        .mockReturnValueOnce(retry$);
      createForm();
      component.serviceRequestForm.controls.message.setValue(message);

      component.onSubmit();

      expect(component.isSubmitting()).toBe(false);
      expect(component.submitError()).toBe(
        'Impossible d’envoyer votre demande. Veuillez réessayer.',
      );
      expect(component.serviceRequestForm.getRawValue()).toEqual({ message });
      expect(router.navigate).not.toHaveBeenCalled();

      component.onSubmit();

      expect(serviceRequestStoreStub.add).toHaveBeenCalledTimes(2);
      expect(serviceRequestStoreStub.add).toHaveBeenLastCalledWith(7, 12, { message });
      expect(component.isSubmitting()).toBe(true);
      expect(component.submitError()).toBeNull();
      expect(router.navigate).not.toHaveBeenCalled();
      retry$.next(createdRequest);
      retry$.complete();

      expect(component.isSubmitting()).toBe(false);
      expect(component.submitError()).toBeNull();
      expect(router.navigate).toHaveBeenCalledExactlyOnceWith(['/service-providers', 7]);
    });
  });

  describe('form display', () => {
    function element(): HTMLElement {
      return fixture.nativeElement as HTMLElement;
    }

    function typeMessage(value: string) {
      const input = element().querySelector<HTMLTextAreaElement>('#message')!;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
    }

    function submitForm() {
      element()
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      fixture.detectChanges();
    }

    it.each([
      { pricingType: ServicePricingType.HOURLY, hourlyRate: 35, label: '35 € / heure' },
      { pricingType: ServicePricingType.FREE, hourlyRate: null, label: 'Prestation gratuite' },
    ])('should display the selected $pricingType offering and a message form', (pricing) => {
      const offering = {
        ...hourlyOffering,
        pricingType: pricing.pricingType,
        hourlyRate: pricing.hourlyRate,
      };
      serviceOfferingStoreStub.getAll.mockReturnValue(of([offering]));

      createForm();

      expect(element().querySelector('h2')?.textContent?.trim()).toBe('Envoyer une demande');
      expect(element().querySelector('h3')?.textContent?.trim()).toBe(offering.title);
      const paragraphs = Array.from(element().querySelectorAll('p'), (p) => p.textContent?.trim());
      expect(paragraphs).toContain(offering.description);
      expect(paragraphs).toContain(pricing.label);
      if (pricing.pricingType === ServicePricingType.FREE) {
        expect(element().textContent).not.toContain('€ / heure');
      } else {
        expect(paragraphs).not.toContain('Prestation gratuite');
      }
      expect(element().querySelector('form')).not.toBeNull();
      expect(element().querySelector('label[for="message"]')?.textContent?.trim()).toBe(
        'Votre message',
      );
      expect(element().querySelector<HTMLTextAreaElement>('#message')?.value).toBe('');
      expect(element().querySelector('.field-error')).toBeNull();
      const button = element().querySelector<HTMLButtonElement>('button[type="submit"]')!;
      expect(button.textContent?.trim()).toBe('Envoyer ma demande');
      expect(button.disabled).toBe(false);
      expect(element().querySelector('a')?.getAttribute('href')).toBe('/service-providers/7');
    });

    it('should hide the form while loading and keep the return link available', () => {
      const response$ = new Subject<ServiceOffering[]>();
      serviceOfferingStoreStub.getAll.mockReturnValue(response$);

      createForm();

      expect(element().querySelector('[role="status"]')?.textContent?.trim()).toBe(
        'Chargement de l’offre de service...',
      );
      expect(element().querySelector('form')).toBeNull();
      expect(element().querySelector('h3')).toBeNull();
      expect(element().querySelector('a')?.getAttribute('href')).toBe('/service-providers/7');

      response$.next([hourlyOffering]);
      response$.complete();
      fixture.detectChanges();

      expect(element().querySelector('[role="status"]')).toBeNull();
      expect(element().querySelector('form')).not.toBeNull();
    });

    it.each([
      { kind: 'missing offering', message: 'Cette offre de service est introuvable.' },
      {
        kind: 'HTTP error',
        message: 'Impossible de charger cette offre de service. Veuillez réessayer.',
      },
    ])(
      'should display a $kind alert instead of the form and keep the return link',
      ({ kind, message }) => {
        serviceOfferingStoreStub.getAll.mockReturnValue(
          kind === 'missing offering'
            ? of([])
            : throwError(() => new HttpErrorResponse({ status: 500 })),
        );

        createForm();

        const alert = element().querySelector('[role="alert"]');
        expect(alert?.textContent?.trim()).toBe(message);
        expect(alert?.classList.contains('error-message')).toBe(true);
        expect(element().querySelector('form')).toBeNull();
        expect(element().querySelector('[role="status"]')).toBeNull();
        expect(element().querySelector('a')?.getAttribute('href')).toBe('/service-providers/7');
      },
    );

    it('should reveal validation after an empty submission and clear it when text is entered', () => {
      createForm();
      expect(element().querySelector('.field-error')).toBeNull();

      submitForm();

      expect(element().querySelector('.field-error')?.textContent?.trim()).toBe(
        'Le message doit contenir du texte.',
      );
      expect(serviceRequestStoreStub.add).not.toHaveBeenCalled();
      expect(router.navigate).not.toHaveBeenCalled();

      typeMessage('   ');
      expect(element().querySelector('.field-error')).not.toBeNull();
      typeMessage(message);
      expect(element().querySelector('.field-error')).toBeNull();
      expect(component.serviceRequestForm.getRawValue()).toEqual({ message });
    });

    it('should send the typed message and disable the button until the response completes', () => {
      const response$ = new Subject<ServiceRequest>();
      serviceRequestStoreStub.add.mockReturnValue(response$);
      createForm();
      typeMessage(message);

      submitForm();

      const button = element().querySelector<HTMLButtonElement>('button[type="submit"]')!;
      expect(serviceRequestStoreStub.add).toHaveBeenCalledExactlyOnceWith(7, 12, { message });
      expect(button.disabled).toBe(true);
      expect(button.textContent?.trim()).toBe('Envoi en cours...');
      expect(router.navigate).not.toHaveBeenCalled();
      button.click();
      expect(serviceRequestStoreStub.add).toHaveBeenCalledTimes(1);

      response$.next(createdRequest);
      response$.complete();
      fixture.detectChanges();

      expect(button.disabled).toBe(false);
      expect(button.textContent?.trim()).toBe('Envoyer ma demande');
      expect(router.navigate).toHaveBeenCalledExactlyOnceWith(['/service-providers', 7]);
    });

    it('should display a submission failure, preserve the typed message and clear the alert on retry', () => {
      const retry$ = new Subject<ServiceRequest>();
      serviceRequestStoreStub.add
        .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })))
        .mockReturnValueOnce(retry$);
      createForm();
      typeMessage(message);

      submitForm();

      const alert = element().querySelector('[role="alert"]');
      expect(alert?.textContent?.trim()).toBe(
        'Impossible d’envoyer votre demande. Veuillez réessayer.',
      );
      expect(alert?.classList.contains('error-message')).toBe(true);
      expect(element().querySelector<HTMLTextAreaElement>('#message')?.value).toBe(message);
      const button = element().querySelector<HTMLButtonElement>('button[type="submit"]')!;
      expect(button.disabled).toBe(false);
      expect(router.navigate).not.toHaveBeenCalled();
      expect(element().querySelector('a')?.getAttribute('href')).toBe('/service-providers/7');

      button.click();
      fixture.detectChanges();

      expect(serviceRequestStoreStub.add).toHaveBeenCalledTimes(2);
      expect(element().querySelector('[role="alert"]')).toBeNull();
      expect(button.disabled).toBe(true);
      expect(button.textContent?.trim()).toBe('Envoi en cours...');
      retry$.next(createdRequest);
      retry$.complete();
      fixture.detectChanges();
      expect(button.disabled).toBe(false);
      expect(router.navigate).toHaveBeenCalledExactlyOnceWith(['/service-providers', 7]);
    });
  });
});
