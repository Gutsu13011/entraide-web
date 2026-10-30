import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  type ParamMap,
  provideRouter,
  Router,
} from '@angular/router';
import { ServiceRequestForm } from './service-request-form';
import { HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, finalize, of, Subject, throwError } from 'rxjs';
import { ServiceOfferingStore } from '../../../service-offerings/services/service-offering-store';
import { ServiceOffering, ServicePricingType } from '../../../models/service-offering.model';
import { ServiceRequestStore } from '../../services/service-request-store';
import { ServiceRequest, ServiceRequestStatus } from '../../../models/service-request.model';

describe('ServiceRequestForm', () => {
  let component: ServiceRequestForm;
  let fixture: ComponentFixture<ServiceRequestForm>;
  const serviceOfferingStoreStub = { getById: vi.fn(), getAll: vi.fn() };
  const serviceRequestStoreStub = { add: vi.fn() };
  let router: Router;
  let routeParams: BehaviorSubject<ParamMap>;
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
    hasReview: false,
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
    routeParams = new BehaviorSubject(convertToParamMap({ id: '7', offeringId: '12' }));
    serviceOfferingStoreStub.getAll.mockReset();
    serviceOfferingStoreStub.getById.mockReset().mockReturnValue(of(hourlyOffering));
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
            paramMap: routeParams.asObservable(),
          },
        },
      ],
    }).compileComponents();
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  afterEach(() => {
    expect(serviceOfferingStoreStub.getAll).not.toHaveBeenCalled();
    routeParams.complete();
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
    ])('should load the selected $pricingType offering directly', (pricing) => {
      const selectedOffering = { ...hourlyOffering, ...pricing };
      serviceOfferingStoreStub.getById.mockReturnValue(of(selectedOffering));

      createForm();

      expect(serviceOfferingStoreStub.getById).toHaveBeenCalledExactlyOnceWith(7, 12);
      expect(component.serviceOffering()).toEqual(selectedOffering);
      expect(component.isLoading()).toBe(false);
      expect(component.loadError()).toBeNull();
      expect(component.serviceRequestForm.getRawValue()).toEqual({ message: '' });
    });

    it('should remain loading until the offering request completes', () => {
      const response$ = new Subject<ServiceOffering>();
      serviceOfferingStoreStub.getById.mockReturnValue(response$);

      createForm();

      expect(component.isLoading()).toBe(true);
      expect(component.serviceOffering()).toBeNull();
      expect(component.loadError()).toBeNull();
      expect(serviceOfferingStoreStub.getById).toHaveBeenCalledExactlyOnceWith(7, 12);

      response$.next(hourlyOffering);
      expect(component.serviceOffering()).toEqual(hourlyOffering);
      expect(component.isLoading()).toBe(true);

      response$.complete();
      expect(component.isLoading()).toBe(false);
      expect(component.loadError()).toBeNull();
    });

    it('should cancel offering loading on closure and ignore its late response', () => {
      const response = new Subject<ServiceOffering>();
      const requestFinalized = vi.fn();
      serviceOfferingStoreStub.getById.mockReturnValue(response.pipe(finalize(requestFinalized)));
      createForm();

      expect(component.isLoading()).toBe(true);
      expect(requestFinalized).not.toHaveBeenCalled();

      fixture.destroy();

      expect(requestFinalized).toHaveBeenCalledTimes(1);
      expect(component.isLoading()).toBe(false);

      response.next(hourlyOffering);
      response.complete();

      expect(component.serviceOffering()).toBeNull();
      expect(component.loadError()).toBeNull();
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it.each([
      { label: 'the offering is missing', message: 'Service offering not found' },
      { label: 'the provider is missing', message: 'Service provider with id 7 not found' },
    ])('should report an unavailable offering when $label', ({ message }) => {
      serviceOfferingStoreStub.getById.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 404, error: { message } })),
      );

      createForm();

      expect(component.serviceOffering()).toBeNull();
      expect(component.isLoading()).toBe(false);
      expect(component.loadError()).toBe('Cette offre de service est introuvable.');
    });

    it.each([
      { label: 'an HTTP 500 response', error: new HttpErrorResponse({ status: 500 }) },
      { label: 'an unexpected loading failure', error: new Error('Network unavailable') },
    ])('should report $label and stop showing progress', ({ error }) => {
      const response$ = new Subject<ServiceOffering>();
      serviceOfferingStoreStub.getById.mockReturnValue(response$);
      createForm();
      expect(component.isLoading()).toBe(true);

      response$.error(error);

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
        const loading$ = new Subject<ServiceOffering>();
        if (state === 'loading') serviceOfferingStoreStub.getById.mockReturnValue(loading$);
        if (state === 'missing offering')
          serviceOfferingStoreStub.getById.mockReturnValue(
            throwError(() => new HttpErrorResponse({ status: 404 })),
          );
        if (state === 'loading error') {
          serviceOfferingStoreStub.getById.mockReturnValue(
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
        serviceOfferingStoreStub.getById.mockReturnValue(of({ ...hourlyOffering, ...pricing }));
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

    it('should cancel sending on closure without redirecting from a late response', () => {
      const response = new Subject<ServiceRequest>();
      const requestFinalized = vi.fn();
      serviceRequestStoreStub.add.mockReturnValue(response.pipe(finalize(requestFinalized)));
      createForm();
      component.serviceRequestForm.controls.message.setValue(message);

      component.onSubmit();

      expect(serviceRequestStoreStub.add).toHaveBeenCalledExactlyOnceWith(7, 12, { message });
      expect(component.isSubmitting()).toBe(true);
      expect(requestFinalized).not.toHaveBeenCalled();

      fixture.destroy();

      expect(requestFinalized).toHaveBeenCalledTimes(1);
      expect(component.isSubmitting()).toBe(false);

      response.next(createdRequest);
      response.complete();

      expect(router.navigate).not.toHaveBeenCalled();
      expect(component.submitError()).toBeNull();
    });

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

  describe('offering context changes', () => {
    it.each([
      { label: 'only the offering id changes', providerId: 7, offeringId: 13 },
      { label: 'only the provider id changes', providerId: 8, offeringId: 12 },
    ])(
      'should clear the previous draft and pricing and submit to the current context when $label',
      ({ providerId, offeringId }) => {
        createForm();
        const control = component.serviceRequestForm.controls.message;
        control.setValue('Ancien brouillon');
        control.markAsDirty();
        control.markAsTouched();
        const response = new Subject<ServiceOffering>();
        serviceOfferingStoreStub.getById.mockReturnValueOnce(response);
        const next: ServiceOffering = {
          ...hourlyOffering,
          id: offeringId,
          serviceProviderId: providerId,
          title: 'Nouvelle offre',
          pricingType: ServicePricingType.FREE,
          hourlyRate: null,
        };

        routeParams.next(
          convertToParamMap({ id: String(providerId), offeringId: String(offeringId) }),
        );
        fixture.detectChanges();

        expect(component.serviceProviderId).toBe(providerId);
        expect(component.serviceOfferingId).toBe(offeringId);
        expect(serviceOfferingStoreStub.getById).toHaveBeenLastCalledWith(providerId, offeringId);
        expect(component.serviceOffering()).toBeNull();
        expect(component.isLoading()).toBe(true);
        expect(control.value).toBe('');
        expect(control.pristine).toBe(true);
        expect(control.untouched).toBe(true);
        expect(fixture.nativeElement.querySelector('form')).toBeNull();
        expect(fixture.nativeElement.querySelector('h3')).toBeNull();
        expect(fixture.nativeElement.textContent).not.toContain('35 € / heure');
        expect(fixture.nativeElement.querySelector('a')?.getAttribute('href')).toBe(
          `/service-providers/${providerId}`,
        );
        control.setValue(message);
        component.onSubmit();
        expect(serviceRequestStoreStub.add).not.toHaveBeenCalled();
        response.next(next);
        response.complete();
        fixture.detectChanges();

        expect(component.serviceOffering()).toEqual(next);
        expect(component.isLoading()).toBe(false);
        expect(fixture.nativeElement.querySelector('h3')?.textContent).toBe('Nouvelle offre');
        expect(fixture.nativeElement.textContent).toContain('Prestation gratuite');
        expect(fixture.nativeElement.textContent).not.toContain('35 € / heure');
        expect(fixture.nativeElement.querySelector('textarea')?.value).toBe(message);
        component.onSubmit();
        expect(serviceRequestStoreStub.add).toHaveBeenCalledExactlyOnceWith(
          providerId,
          offeringId,
          { message },
        );
        expect(router.navigate).toHaveBeenCalledWith(['/service-providers', providerId]);
      },
    );

    it('should cancel the old offering load and ignore its late response while keeping the new load active', () => {
      const oldResponse = new Subject<ServiceOffering>();
      const newResponse = new Subject<ServiceOffering>();
      const stopped = vi.fn();
      serviceOfferingStoreStub.getById
        .mockReturnValueOnce(oldResponse.pipe(finalize(stopped)))
        .mockReturnValueOnce(newResponse);
      createForm();
      expect(stopped).not.toHaveBeenCalled();

      routeParams.next(convertToParamMap({ id: '8', offeringId: '13' }));

      expect(stopped).toHaveBeenCalledTimes(1);
      expect(component.isLoading()).toBe(true);
      const next = { ...hourlyOffering, id: 13, serviceProviderId: 8, title: 'Nouvelle offre' };
      newResponse.next(next);
      newResponse.complete();
      oldResponse.next(hourlyOffering);
      oldResponse.complete();
      fixture.detectChanges();

      expect(component.serviceOffering()).toEqual(next);
      expect(component.isLoading()).toBe(false);
      expect(component.loadError()).toBeNull();
      expect(fixture.nativeElement.querySelector('h3')?.textContent).toBe('Nouvelle offre');
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('should clear submission errors and recover after loading errors and missing offerings', () => {
      createForm();
      component.serviceRequestForm.controls.message.setValue(message);
      serviceRequestStoreStub.add.mockReturnValueOnce(
        throwError(() => new HttpErrorResponse({ status: 500 })),
      );
      component.onSubmit();
      expect(component.submitError()).not.toBeNull();
      serviceOfferingStoreStub.getById
        .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })))
        .mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 404 })))
        .mockReturnValueOnce(of({ ...hourlyOffering, id: 15 }));

      routeParams.next(convertToParamMap({ id: '7', offeringId: '13' }));

      expect(component.submitError()).toBeNull();
      expect(component.serviceRequestForm.controls.message.value).toBe('');
      expect(component.loadError()).toBe(
        'Impossible de charger cette offre de service. Veuillez réessayer.',
      );
      expect(component.isLoading()).toBe(false);
      routeParams.next(convertToParamMap({ id: '7', offeringId: '14' }));
      expect(component.loadError()).toBe('Cette offre de service est introuvable.');
      routeParams.next(convertToParamMap({ id: '7', offeringId: '15' }));
      fixture.detectChanges();
      expect(component.loadError()).toBeNull();
      expect(component.submitError()).toBeNull();
      expect(component.isLoading()).toBe(false);
      expect(component.serviceOffering()?.id).toBe(15);
      expect(fixture.nativeElement.querySelector('form')).not.toBeNull();
    });

    it('should preserve the draft and avoid reloading when both route ids remain the same', () => {
      createForm();
      const control = component.serviceRequestForm.controls.message;
      control.setValue(message);
      control.markAsDirty();
      control.markAsTouched();

      routeParams.next(convertToParamMap({ id: '7', offeringId: '12', tab: 'message' }));
      fixture.detectChanges();

      expect(serviceOfferingStoreStub.getById).toHaveBeenCalledTimes(1);
      expect(control.value).toBe(message);
      expect(control.dirty).toBe(true);
      expect(control.touched).toBe(true);
      expect(component.serviceOffering()).toEqual(hourlyOffering);
    });

    it.each(['success', 'error'] as const)(
      'should ignore the old submission late %s without disrupting a new submission',
      (outcome) => {
        createForm();
        const oldResponse = new Subject<ServiceRequest>();
        const newResponse = new Subject<ServiceRequest>();
        const stopped = vi.fn();
        serviceRequestStoreStub.add
          .mockReturnValueOnce(oldResponse.pipe(finalize(stopped)))
          .mockReturnValueOnce(newResponse);
        component.serviceRequestForm.controls.message.setValue(message);
        component.onSubmit();
        expect(component.isSubmitting()).toBe(true);
        expect(stopped).not.toHaveBeenCalled();
        serviceOfferingStoreStub.getById.mockReturnValueOnce(
          of({ ...hourlyOffering, id: 13, serviceProviderId: 8 }),
        );

        routeParams.next(convertToParamMap({ id: '8', offeringId: '13' }));

        expect(stopped).toHaveBeenCalledTimes(1);
        expect(component.isSubmitting()).toBe(false);
        const newMessage = 'Bonjour pour cette nouvelle offre.';
        component.serviceRequestForm.controls.message.setValue(newMessage);
        component.onSubmit();
        expect(serviceRequestStoreStub.add).toHaveBeenLastCalledWith(8, 13, {
          message: newMessage,
        });
        expect(component.isSubmitting()).toBe(true);
        if (outcome === 'success') {
          oldResponse.next(createdRequest);
          oldResponse.complete();
        } else {
          oldResponse.error(new HttpErrorResponse({ status: 500 }));
        }
        expect(component.isSubmitting()).toBe(true);
        expect(component.submitError()).toBeNull();
        expect(component.serviceRequestForm.controls.message.value).toBe(newMessage);
        expect(router.navigate).not.toHaveBeenCalled();
        newResponse.next({
          ...createdRequest,
          serviceProviderId: 8,
          serviceOfferingId: 13,
          message: newMessage,
        });
        newResponse.complete();
        expect(component.isSubmitting()).toBe(false);
        expect(router.navigate).toHaveBeenCalledExactlyOnceWith(['/service-providers', 8]);
      },
    );
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
      serviceOfferingStoreStub.getById.mockReturnValue(of(offering));

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
      const response$ = new Subject<ServiceOffering>();
      serviceOfferingStoreStub.getById.mockReturnValue(response$);

      createForm();

      expect(element().querySelector('[role="status"]')?.textContent?.trim()).toBe(
        'Chargement de l’offre de service...',
      );
      expect(element().querySelector('form')).toBeNull();
      expect(element().querySelector('h3')).toBeNull();
      expect(element().querySelector('a')?.getAttribute('href')).toBe('/service-providers/7');

      response$.next(hourlyOffering);
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
        serviceOfferingStoreStub.getById.mockReturnValue(
          kind === 'missing offering'
            ? throwError(() => new HttpErrorResponse({ status: 404 }))
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
