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
import { ServiceProviderStore } from '../../../service-providers/services/service-provider-store';
import { AuthSession } from '../../../auth/services/auth-session';
import type { ServiceProvider } from '../../../models/service-provider.model';
import { finalize, of, Subject, throwError } from 'rxjs';

describe('ServiceOfferingForm', () => {
  const serviceOfferingStoreStub = {
    add: vi.fn(),
    update: vi.fn(),
    getAll: vi.fn(),
  };

  const currentUserMock = {
    id: 42,
    firstName: 'Alice',
    lastName: 'Martin',
    email: 'alicemartin@example.com',
  };
  const providerMock: ServiceProvider = {
    id: 7,
    ownerUserId: currentUserMock.id,
    firstName: 'Alice',
    lastName: 'Martin',
    profession: 'Plombière',
    city: 'Paris',
    description: 'Installation et dépannage de plomberie.',
    hourlyRate: 35,
    available: true,
    imageUrl: '',
  };
  const authSessionStub = { currentUser: vi.fn() };
  const serviceProviderStoreStub = { getById: vi.fn() };

  let component: ServiceOfferingForm;
  let harness: RouterTestingHarness;
  let router: Router;

  beforeEach(async () => {
    serviceOfferingStoreStub.add.mockReset();
    serviceOfferingStoreStub.update.mockReset();
    serviceOfferingStoreStub.getAll.mockReset().mockReturnValue(of([]));
    authSessionStub.currentUser.mockReset().mockReturnValue(currentUserMock);
    serviceProviderStoreStub.getById.mockReset().mockReturnValue(of(providerMock));
    await TestBed.configureTestingModule({
      imports: [ServiceOfferingForm],
      providers: [
        provideRouter([
          {
            path: 'service-providers/:id/service-offerings/new',
            component: ServiceOfferingForm,
          },
          {
            path: 'service-providers/:id/service-offerings/:offeringId/edit',
            component: ServiceOfferingForm,
          },
        ]),
        { provide: ServiceOfferingStore, useValue: serviceOfferingStoreStub },
        { provide: ServiceProviderStore, useValue: serviceProviderStoreStub },
        { provide: AuthSession, useValue: authSessionStub },
      ],
    }).compileComponents();

    harness = await RouterTestingHarness.create();
    component = await harness.navigateByUrl(
      '/service-providers/7/service-offerings/new',
      ServiceOfferingForm,
    );
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should stay in creation mode when the route has no offering id', () => {
    expect(component.serviceProviderId).toBe(7);
    expect(component.serviceOfferingId).toBeNull();
    expect(component.isEditMode).toBe(false);
  });

  it('should read the offering id separately from the provider id in edit mode', async () => {
    component = await harness.navigateByUrl(
      '/service-providers/7/service-offerings/12/edit',
      ServiceOfferingForm,
    );

    expect(component.serviceProviderId).toBe(7);
    expect(component.serviceOfferingId).toBe(12);
    expect(component.isEditMode).toBe(true);
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

  it('should stop reacting to pricing changes after leaving the form', async () => {
    const controls = component.serviceOfferingForm.controls;
    controls.hourlyRate.setValue(29);

    await harness.navigateByUrl(
      '/service-providers/7/service-offerings/12/edit',
      ServiceOfferingForm,
    );
    controls.pricingType.setValue(ServicePricingType.FREE);

    expect(controls.hourlyRate.value).toBe(29);
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
    expect(serviceOfferingStoreStub.update).not.toHaveBeenCalled();
    expect(component.serviceOfferingForm.controls.title.touched).toBe(true);
    expect(component.serviceOfferingForm.controls.description.touched).toBe(true);
  });

  it.each<[string, CreateServiceOffering]>([
    [
      'a free offering without an hourly rate',
      {
        title: 'titre',
        description: 'description',
        pricingType: ServicePricingType.FREE,
      },
    ],
    [
      'an hourly offering with its rate',
      {
        title: 'titre',
        description: 'description',
        pricingType: ServicePricingType.HOURLY,
        hourlyRate: 29,
      },
    ],
  ])('should submit %s', (_label, payload) => {
    const serviceOfferingResponse: ServiceOffering = {
      ...payload,
      id: 1,
      hourlyRate: payload.hourlyRate ?? null,
      serviceProviderId: 7,
    };
    serviceOfferingStoreStub.add.mockReturnValue(of(serviceOfferingResponse));
    component.serviceOfferingForm.patchValue(payload);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.onSubmit();

    expect(serviceOfferingStoreStub.add).toHaveBeenCalledWith(7, payload);
    expect(navigateSpy).toHaveBeenCalledWith(['/service-providers', 7]);
  });

  describe('loading an offering for editing', () => {
    const hourlyOffering: ServiceOffering = {
      id: 12,
      serviceProviderId: 7,
      title: 'Conseil plomberie',
      description: 'Conseils pour entretenir votre installation.',
      pricingType: ServicePricingType.HOURLY,
      hourlyRate: 35,
    };

    async function openEditForm() {
      component = await harness.navigateByUrl(
        '/service-providers/7/service-offerings/12/edit',
        ServiceOfferingForm,
      );
    }

    it('should not load existing offerings in creation mode', () => {
      expect(serviceOfferingStoreStub.getAll).not.toHaveBeenCalled();
      expect(component.isLoading()).toBe(false);
      expect(component.loadError()).toBeNull();
    });

    it.each([
      hourlyOffering,
      { ...hourlyOffering, pricingType: ServicePricingType.FREE, hourlyRate: null },
    ])('should prefill a $pricingType offering selected by its route id', async (offering) => {
      serviceOfferingStoreStub.getAll.mockReturnValue(
        of([{ ...hourlyOffering, id: 11, title: 'Autre offre' }, offering]),
      );

      await openEditForm();

      expect(serviceOfferingStoreStub.getAll).toHaveBeenCalledExactlyOnceWith(7);
      expect(component.serviceOfferingForm.getRawValue()).toEqual({
        title: offering.title,
        description: offering.description,
        pricingType: offering.pricingType,
        hourlyRate: offering.hourlyRate,
      });
      expect(component.serviceOfferingForm.valid).toBe(true);
      expect(component.isLoading()).toBe(false);
      expect(component.loadError()).toBeNull();
    });

    it('should block submission while loading and clear loading when the request completes', async () => {
      const response$ = new Subject<ServiceOffering[]>();
      serviceOfferingStoreStub.getAll.mockReturnValue(response$);
      await openEditForm();
      component.serviceOfferingForm.patchValue({
        title: 'Titre valide',
        description: 'Description valide',
        hourlyRate: 20,
      });
      expect(component.serviceOfferingForm.valid).toBe(true);
      expect(component.isLoading()).toBe(true);
      harness.detectChanges();
      const element = harness.routeNativeElement as HTMLElement;
      expect(element.querySelector('[role="status"]')?.textContent).toContain('Chargement');
      expect(element.querySelector('form')).toBeNull();
      expect(element.querySelector('a')?.getAttribute('href')).toBe('/service-providers/7');

      component.onSubmit();
      expect(serviceOfferingStoreStub.add).not.toHaveBeenCalled();
      expect(serviceOfferingStoreStub.update).not.toHaveBeenCalled();

      response$.next([hourlyOffering]);
      expect(component.serviceOfferingForm.controls.hourlyRate.value).toBe(20);
      expect(component.isLoading()).toBe(true);
      response$.complete();
      expect(component.serviceOfferingForm.controls.hourlyRate.value).toBe(35);
      expect(component.isLoading()).toBe(false);
      expect(component.loadError()).toBeNull();
      harness.detectChanges();
      expect(element.querySelector('[role="status"]')).toBeNull();
      expect(element.querySelector('form')).not.toBeNull();
    });

    it('should cancel both edit requests on departure without prefilling from late responses', async () => {
      const providerResponse = new Subject<ServiceProvider>();
      const offeringsResponse = new Subject<ServiceOffering[]>();
      const providerFinalized = vi.fn();
      const offeringsFinalized = vi.fn();
      serviceProviderStoreStub.getById.mockReturnValue(
        providerResponse.pipe(finalize(providerFinalized)),
      );
      serviceOfferingStoreStub.getAll.mockReturnValue(
        offeringsResponse.pipe(finalize(offeringsFinalized)),
      );
      await openEditForm();
      const abandonedForm = component;
      const originalValues = abandonedForm.serviceOfferingForm.getRawValue();
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      expect(abandonedForm.isLoading()).toBe(true);
      expect(providerFinalized).not.toHaveBeenCalled();
      expect(offeringsFinalized).not.toHaveBeenCalled();

      await harness.navigateByUrl(
        '/service-providers/7/service-offerings/new',
        ServiceOfferingForm,
      );

      expect(providerFinalized).toHaveBeenCalledTimes(1);
      expect(offeringsFinalized).toHaveBeenCalledTimes(1);
      expect(abandonedForm.isLoading()).toBe(false);

      providerResponse.next(providerMock);
      providerResponse.complete();
      offeringsResponse.next([hourlyOffering]);
      offeringsResponse.complete();

      expect(abandonedForm.serviceOfferingForm.getRawValue()).toEqual(originalValues);
      expect(abandonedForm.loadError()).toBeNull();
      expect(navigateSpy).not.toHaveBeenCalled();
    });

    it('should report a loading failure and block submission even if the form is valid', async () => {
      serviceOfferingStoreStub.getAll.mockReturnValue(
        throwError(() => new Error('Network unavailable')),
      );
      await openEditForm();

      expect(component.isLoading()).toBe(false);
      expect(component.loadError()).toBe(
        'Impossible de charger cette offre de service. Veuillez réessayer.',
      );
      harness.detectChanges();
      const element = harness.routeNativeElement as HTMLElement;
      expect(element.querySelector('form')).toBeNull();
      expect(element.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
        component.loadError(),
      );
      expect(element.querySelector('a')?.getAttribute('href')).toBe('/service-providers/7');
      component.serviceOfferingForm.patchValue({
        title: 'Titre valide',
        description: 'Description valide',
        hourlyRate: 20,
      });
      expect(component.serviceOfferingForm.valid).toBe(true);
      component.onSubmit();
      expect(serviceOfferingStoreStub.add).not.toHaveBeenCalled();
      expect(serviceOfferingStoreStub.update).not.toHaveBeenCalled();
    });

    it('should report an offering missing from the provider list and block submission', async () => {
      serviceOfferingStoreStub.getAll.mockReturnValue(
        of([{ ...hourlyOffering, id: 13, title: 'Autre offre' }]),
      );
      await openEditForm();

      expect(component.isLoading()).toBe(false);
      expect(component.loadError()).toBe('Cette offre de service est introuvable.');
      harness.detectChanges();
      const element = harness.routeNativeElement as HTMLElement;
      expect(element.querySelector('form')).toBeNull();
      expect(element.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
        component.loadError(),
      );
      expect(element.querySelector('a')?.getAttribute('href')).toBe('/service-providers/7');
      expect(component.serviceOfferingForm.controls.title.value).toBe('');
      component.serviceOfferingForm.patchValue({
        title: 'Titre valide',
        description: 'Description valide',
        hourlyRate: 20,
      });
      expect(component.serviceOfferingForm.valid).toBe(true);
      component.onSubmit();
      expect(serviceOfferingStoreStub.add).not.toHaveBeenCalled();
      expect(serviceOfferingStoreStub.update).not.toHaveBeenCalled();
    });
  });

  describe('saving an offering', () => {
    const hourlyOffering: ServiceOffering = {
      id: 12,
      serviceProviderId: 7,
      title: 'Conseil plomberie',
      description: 'Conseils pour entretenir votre installation.',
      pricingType: ServicePricingType.HOURLY,
      hourlyRate: 35,
    };

    async function openForm(mode: 'creation' | 'edition', offering = hourlyOffering) {
      if (mode === 'edition') {
        serviceOfferingStoreStub.getAll.mockReturnValue(of([offering]));
        component = await harness.navigateByUrl(
          '/service-providers/7/service-offerings/12/edit',
          ServiceOfferingForm,
        );
      } else {
        component.serviceOfferingForm.patchValue(offering);
      }
    }

    it.each([
      {
        label: 'an hourly offering with updated text and rate',
        initial: hourlyOffering,
        pricingType: ServicePricingType.HOURLY,
        hourlyRate: 42,
      },
      {
        label: 'an hourly offering changed to free',
        initial: hourlyOffering,
        pricingType: ServicePricingType.FREE,
        hourlyRate: null,
      },
      {
        label: 'a free offering changed to hourly',
        initial: { ...hourlyOffering, pricingType: ServicePricingType.FREE, hourlyRate: null },
        pricingType: ServicePricingType.HOURLY,
        hourlyRate: 42,
      },
    ])(
      'should update $label without creating another offering',
      async ({ initial, pricingType, hourlyRate }) => {
        await openForm('edition', initial);
        component.serviceOfferingForm.patchValue({
          title: 'Nouveau titre',
          description: 'Description mise à jour.',
          pricingType,
          hourlyRate,
        });
        const expectedPayload = {
          title: 'Nouveau titre',
          description: 'Description mise à jour.',
          pricingType,
          ...(pricingType === ServicePricingType.HOURLY ? { hourlyRate } : {}),
        };
        const response = { ...hourlyOffering, ...expectedPayload, hourlyRate };
        serviceOfferingStoreStub.update.mockReturnValue(of(response));
        const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

        component.onSubmit();

        expect(serviceOfferingStoreStub.update).toHaveBeenCalledExactlyOnceWith(
          7,
          12,
          expectedPayload,
        );
        expect(serviceOfferingStoreStub.add).not.toHaveBeenCalled();
        expect(navigateSpy).toHaveBeenCalledExactlyOnceWith(['/service-providers', 7]);
        expect(component.isSubmitting()).toBe(false);
        expect(component.submitError()).toBeNull();
      },
    );

    it.each([null, 0, -1])('should reject an hourly update with rate %s', async (hourlyRate) => {
      const freeOffering = {
        ...hourlyOffering,
        pricingType: ServicePricingType.FREE,
        hourlyRate: null,
      };
      await openForm('edition', freeOffering);
      component.serviceOfferingForm.patchValue({
        pricingType: ServicePricingType.HOURLY,
        hourlyRate,
      });
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      component.onSubmit();

      expect(component.serviceOfferingForm.invalid).toBe(true);
      expect(component.serviceOfferingForm.controls.hourlyRate.touched).toBe(true);
      expect(serviceOfferingStoreStub.update).not.toHaveBeenCalled();
      expect(serviceOfferingStoreStub.add).not.toHaveBeenCalled();
      expect(navigateSpy).not.toHaveBeenCalled();
    });

    it('should require a new rate after switching an edited hourly offering to free and back', async () => {
      await openForm('edition');
      const controls = component.serviceOfferingForm.controls;
      expect(controls.hourlyRate.value).toBe(35);
      controls.pricingType.setValue(ServicePricingType.FREE);
      controls.pricingType.setValue(ServicePricingType.HOURLY);

      component.onSubmit();

      expect(controls.hourlyRate.value).toBeNull();
      expect(controls.hourlyRate.hasError('required')).toBe(true);
      expect(serviceOfferingStoreStub.update).not.toHaveBeenCalled();
      expect(serviceOfferingStoreStub.add).not.toHaveBeenCalled();
    });

    it.each(['creation', 'edition'] as const)(
      'should cancel saving on departure and ignore a late response in %s mode',
      async (mode) => {
        await openForm(mode);
        const abandonedForm = component;
        const savedOfferingResponse = new Subject<ServiceOffering>();
        const requestFinalized = vi.fn();
        const requestMock =
          mode === 'edition' ? serviceOfferingStoreStub.update : serviceOfferingStoreStub.add;
        requestMock.mockReturnValue(savedOfferingResponse.pipe(finalize(requestFinalized)));
        const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

        abandonedForm.onSubmit();

        expect(requestMock).toHaveBeenCalledTimes(1);
        expect(abandonedForm.isSubmitting()).toBe(true);
        expect(requestFinalized).not.toHaveBeenCalled();

        serviceOfferingStoreStub.getAll.mockReturnValue(of([hourlyOffering]));
        const destination =
          mode === 'creation'
            ? '/service-providers/7/service-offerings/12/edit'
            : '/service-providers/7/service-offerings/new';
        await harness.navigateByUrl(destination, ServiceOfferingForm);

        expect(requestFinalized).toHaveBeenCalledTimes(1);
        expect(abandonedForm.isSubmitting()).toBe(false);

        savedOfferingResponse.next(hourlyOffering);
        savedOfferingResponse.complete();

        expect(navigateSpy).not.toHaveBeenCalled();
        expect(abandonedForm.submitError()).toBeNull();
      },
    );

    it.each(['creation', 'edition'] as const)(
      'should block duplicate submissions and wait for a response in %s mode',
      async (mode) => {
        await openForm(mode);
        const response$ = new Subject<ServiceOffering>();
        const requestMock =
          mode === 'edition' ? serviceOfferingStoreStub.update : serviceOfferingStoreStub.add;
        const unusedMock =
          mode === 'edition' ? serviceOfferingStoreStub.add : serviceOfferingStoreStub.update;
        requestMock.mockReturnValue(response$);
        const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

        component.onSubmit();
        expect(component.isSubmitting()).toBe(true);
        expect(navigateSpy).not.toHaveBeenCalled();
        component.onSubmit();
        expect(requestMock).toHaveBeenCalledTimes(1);
        expect(unusedMock).not.toHaveBeenCalled();

        response$.next(hourlyOffering);
        expect(navigateSpy).toHaveBeenCalledExactlyOnceWith(['/service-providers', 7]);
        response$.complete();
        expect(component.isSubmitting()).toBe(false);
        expect(component.submitError()).toBeNull();
      },
    );

    it.each(['creation', 'edition'] as const)(
      'should preserve entered values after a save failure and allow retry in %s mode',
      async (mode) => {
        await openForm(mode);
        const requestMock =
          mode === 'edition' ? serviceOfferingStoreStub.update : serviceOfferingStoreStub.add;
        const unusedMock =
          mode === 'edition' ? serviceOfferingStoreStub.add : serviceOfferingStoreStub.update;
        const retry$ = new Subject<ServiceOffering>();
        requestMock
          .mockReturnValueOnce(throwError(() => new Error('Save failed')))
          .mockReturnValueOnce(retry$);
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
        const enteredValues = component.serviceOfferingForm.getRawValue();

        component.onSubmit();

        expect(component.isSubmitting()).toBe(false);
        expect(component.submitError()).toBe(
          'Impossible d’enregistrer cette offre de service. Veuillez réessayer.',
        );
        expect(component.serviceOfferingForm.getRawValue()).toEqual(enteredValues);
        expect(navigateSpy).not.toHaveBeenCalled();

        component.onSubmit();
        expect(requestMock).toHaveBeenCalledTimes(2);
        expect(unusedMock).not.toHaveBeenCalled();
        expect(component.isSubmitting()).toBe(true);
        expect(component.submitError()).toBeNull();
        retry$.next(hourlyOffering);
        retry$.complete();
        expect(component.isSubmitting()).toBe(false);
        expect(navigateSpy).toHaveBeenCalledExactlyOnceWith(['/service-providers', 7]);
      },
    );
  });

  describe('form display', () => {
    const offering: ServiceOffering = {
      id: 12,
      serviceProviderId: 7,
      title: 'Conseil plomberie',
      description: 'Conseils pour entretenir votre installation.',
      pricingType: ServicePricingType.HOURLY,
      hourlyRate: 35,
    };

    async function openForm(mode: 'creation' | 'edition') {
      if (mode === 'edition') {
        serviceOfferingStoreStub.getAll.mockReturnValue(of([offering]));
        component = await harness.navigateByUrl(
          '/service-providers/7/service-offerings/12/edit',
          ServiceOfferingForm,
        );
      } else {
        component.serviceOfferingForm.patchValue(offering);
      }
      harness.detectChanges();
      return harness.routeNativeElement as HTMLElement;
    }

    it.each([
      {
        mode: 'creation' as const,
        title: 'Ajouter une offre de service',
        button: "Ajouter l'offre de service",
      },
      {
        mode: 'edition' as const,
        title: 'Modifier une offre de service',
        button: 'Enregistrer les modifications',
      },
    ])(
      'should display the title and submit label for $mode mode',
      async ({ mode, title, button }) => {
        const element = await openForm(mode);

        expect(element.querySelector('h2')?.textContent?.trim()).toBe(title);
        const submitButton = element.querySelector<HTMLButtonElement>('button[type="submit"]');
        expect(submitButton?.textContent?.trim()).toBe(button);
        expect(submitButton?.disabled).toBe(false);
        expect(element.querySelector('a')?.getAttribute('href')).toBe('/service-providers/7');
      },
    );

    it.each([
      { mode: 'creation' as const, pendingLabel: 'Ajout en cours...' },
      { mode: 'edition' as const, pendingLabel: 'Enregistrement en cours...' },
    ])(
      'should disable the submit button and show progress while saving in $mode mode',
      async ({ mode, pendingLabel }) => {
        const element = await openForm(mode);
        const response$ = new Subject<ServiceOffering>();
        const requestMock =
          mode === 'edition' ? serviceOfferingStoreStub.update : serviceOfferingStoreStub.add;
        requestMock.mockReturnValue(response$);
        vi.spyOn(router, 'navigate').mockResolvedValue(true);

        element
          .querySelector('form')!
          .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        harness.detectChanges();
        const button = element.querySelector<HTMLButtonElement>('button[type="submit"]');
        expect(button?.disabled).toBe(true);
        expect(button?.textContent?.trim()).toBe(pendingLabel);
        expect(requestMock).toHaveBeenCalledTimes(1);

        response$.next(offering);
        response$.complete();
        harness.detectChanges();
        expect(button?.disabled).toBe(false);
        expect(button?.textContent?.trim()).not.toBe(pendingLabel);
      },
    );

    it.each(['creation', 'edition'] as const)(
      'should display a save error and keep the form usable in %s mode',
      async (mode) => {
        const element = await openForm(mode);
        const requestMock =
          mode === 'edition' ? serviceOfferingStoreStub.update : serviceOfferingStoreStub.add;
        requestMock.mockReturnValue(throwError(() => new Error('Save failed')));
        vi.spyOn(console, 'error').mockImplementation(() => {});

        element
          .querySelector('form')!
          .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        harness.detectChanges();

        const alert = element.querySelector('[role="alert"]');
        expect(alert?.textContent?.trim()).toBe(
          'Impossible d’enregistrer cette offre de service. Veuillez réessayer.',
        );
        expect(alert?.classList.contains('error-message')).toBe(true);
        expect(element.querySelector<HTMLInputElement>('#title')?.value).toBe(offering.title);
        expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(
          false,
        );
        expect(element.querySelector('a')?.getAttribute('href')).toBe('/service-providers/7');
      },
    );
  });

  describe('navigation between offering contexts', () => {
    const hourlyOffering: ServiceOffering = {
      id: 12,
      serviceProviderId: 7,
      title: 'Conseil plomberie',
      description: 'Conseils pour votre installation.',
      pricingType: ServicePricingType.HOURLY,
      hourlyRate: 35,
    };
    const freeOffering: ServiceOffering = {
      ...hourlyOffering,
      pricingType: ServicePricingType.FREE,
      hourlyRate: null,
    };

    async function openOffering(offering = hourlyOffering) {
      serviceOfferingStoreStub.getAll.mockReturnValueOnce(of([offering]));
      component = await harness.navigateByUrl(
        `/service-providers/7/service-offerings/${offering.id}/edit`,
        ServiceOfferingForm,
      );
    }

    it.each([
      { initial: freeOffering, next: { ...hourlyOffering, id: 13, hourlyRate: 48 } },
      { initial: hourlyOffering, next: { ...freeOffering, id: 13 } },
    ])(
      'should reuse the form and reset pricing validation from $initial.pricingType to $next.pricingType',
      async ({ initial, next }) => {
        await openOffering(initial);
        expect(component.serviceOfferingForm.valid).toBe(true);
        const controls = component.serviceOfferingForm.controls;
        controls.title.setValue('Ancien brouillon');
        controls.title.markAsDirty();
        controls.title.markAsTouched();
        const response = new Subject<ServiceOffering[]>();
        serviceOfferingStoreStub.getAll.mockReturnValueOnce(response);

        expect(
          await harness.navigateByUrl(
            '/service-providers/7/service-offerings/13/edit',
            ServiceOfferingForm,
          ),
        ).toBe(component);

        expect(component.serviceOfferingId).toBe(13);
        expect(component.isLoading()).toBe(true);
        expect(controls.title.value).toBe('');
        expect(controls.pricingType.value).toBe(ServicePricingType.HOURLY);
        expect(controls.hourlyRate.value).toBe(0.01);
        expect(component.serviceOfferingForm.pristine).toBe(true);
        expect(component.serviceOfferingForm.untouched).toBe(true);
        expect(harness.routeNativeElement!.querySelector('form')).toBeNull();
        response.next([initial, next]);
        response.complete();
        harness.detectChanges();

        expect(controls.pricingType.value).toBe(next.pricingType);
        expect(controls.hourlyRate.value).toBe(next.hourlyRate);
        expect(component.serviceOfferingForm.valid).toBe(true);
        if (next.pricingType === ServicePricingType.HOURLY) {
          controls.hourlyRate.setValue(null);
          expect(controls.hourlyRate.hasError('required')).toBe(true);
          controls.hourlyRate.setValue(0);
          expect(controls.hourlyRate.hasError('min')).toBe(true);
          controls.hourlyRate.setValue(48);
          expect(component.serviceOfferingForm.valid).toBe(true);
        } else {
          expect(controls.hourlyRate.hasError('required')).toBe(false);
          expect(harness.routeNativeElement!.querySelector('#hourlyRate')).toBeNull();
        }
        serviceOfferingStoreStub.update.mockReturnValue(of(next));
        const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
        component.onSubmit();
        expect(serviceOfferingStoreStub.update).toHaveBeenCalledWith(
          7,
          13,
          expect.objectContaining({ pricingType: next.pricingType }),
        );
        expect(navigateSpy).toHaveBeenCalledWith(['/service-providers', 7]);
      },
    );

    it('should recheck ownership when only the provider id changes', async () => {
      await openOffering();
      serviceProviderStoreStub.getById.mockReturnValueOnce(
        of({ ...providerMock, id: 8, ownerUserId: 99 }),
      );
      serviceOfferingStoreStub.getAll.mockReturnValueOnce(of([]));
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      expect(
        await harness.navigateByUrl(
          '/service-providers/8/service-offerings/12/edit',
          ServiceOfferingForm,
        ),
      ).toBe(component);

      expect(serviceProviderStoreStub.getById).toHaveBeenLastCalledWith(8);
      expect(serviceOfferingStoreStub.getAll).toHaveBeenLastCalledWith(8);
      expect(component.serviceProviderId).toBe(8);
      expect(component.serviceOfferingId).toBe(12);
      expect(component.loadError()).toBe('Vous ne pouvez pas modifier cette offre de service.');
      expect(component.serviceOfferingForm.controls.title.value).toBe('');
      expect(navigateSpy).toHaveBeenCalledWith(['/service-providers', 8]);
      expect(harness.routeNativeElement!.querySelector('form')).toBeNull();
      component.onSubmit();
      expect(serviceOfferingStoreStub.update).not.toHaveBeenCalled();
    });

    it('should reset creation for a different provider and submit using that provider id', async () => {
      const controls = component.serviceOfferingForm.controls;
      controls.pricingType.setValue(ServicePricingType.FREE);
      controls.title.setValue('Ancien brouillon');
      controls.title.markAsDirty();
      controls.title.markAsTouched();

      expect(
        await harness.navigateByUrl(
          '/service-providers/8/service-offerings/new',
          ServiceOfferingForm,
        ),
      ).toBe(component);

      expect(component.serviceProviderId).toBe(8);
      expect(component.serviceOfferingId).toBeNull();
      expect(component.isEditMode).toBe(false);
      expect(component.isLoading()).toBe(false);
      expect(controls.title.value).toBe('');
      expect(controls.pricingType.value).toBe(ServicePricingType.HOURLY);
      expect(controls.hourlyRate.value).toBe(0.01);
      expect(component.serviceOfferingForm.pristine).toBe(true);
      expect(component.serviceOfferingForm.untouched).toBe(true);
      expect(serviceProviderStoreStub.getById).not.toHaveBeenCalled();
      expect(serviceOfferingStoreStub.getAll).not.toHaveBeenCalled();
      expect(harness.routeNativeElement!.querySelector('a')?.getAttribute('href')).toBe(
        '/service-providers/8',
      );
      controls.title.setValue('Nouvelle offre');
      controls.description.setValue('Nouvelle description');
      serviceOfferingStoreStub.add.mockReturnValue(of({ ...hourlyOffering, serviceProviderId: 8 }));
      vi.spyOn(router, 'navigate').mockResolvedValue(true);
      component.onSubmit();
      expect(serviceOfferingStoreStub.add).toHaveBeenCalledWith(
        8,
        expect.objectContaining({
          title: 'Nouvelle offre',
          pricingType: ServicePricingType.HOURLY,
          hourlyRate: 0.01,
        }),
      );
    });

    it('should cancel both old requests and ignore stale ownership and prefill responses', async () => {
      const oldProvider = new Subject<ServiceProvider>();
      const oldOfferings = new Subject<ServiceOffering[]>();
      const newProvider = new Subject<ServiceProvider>();
      const newOfferings = new Subject<ServiceOffering[]>();
      const providerStopped = vi.fn();
      const offeringsStopped = vi.fn();
      serviceProviderStoreStub.getById
        .mockReturnValueOnce(oldProvider.pipe(finalize(providerStopped)))
        .mockReturnValueOnce(newProvider);
      serviceOfferingStoreStub.getAll
        .mockReturnValueOnce(oldOfferings.pipe(finalize(offeringsStopped)))
        .mockReturnValueOnce(newOfferings);
      component = await harness.navigateByUrl(
        '/service-providers/7/service-offerings/12/edit',
        ServiceOfferingForm,
      );
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      expect(providerStopped).not.toHaveBeenCalled();
      expect(offeringsStopped).not.toHaveBeenCalled();

      expect(
        await harness.navigateByUrl(
          '/service-providers/7/service-offerings/13/edit',
          ServiceOfferingForm,
        ),
      ).toBe(component);

      expect(providerStopped).toHaveBeenCalledTimes(1);
      expect(offeringsStopped).toHaveBeenCalledTimes(1);
      expect(component.isLoading()).toBe(true);
      newProvider.next(providerMock);
      newProvider.complete();
      const next = { ...hourlyOffering, id: 13, title: 'Nouvelle offre' };
      newOfferings.next([next]);
      newOfferings.complete();
      oldProvider.next({ ...providerMock, ownerUserId: 99 });
      oldProvider.complete();
      oldOfferings.next([hourlyOffering]);
      oldOfferings.complete();

      expect(component.isLoading()).toBe(false);
      expect(component.serviceOfferingForm.controls.title.value).toBe('Nouvelle offre');
      expect(component.loadError()).toBeNull();
      expect(navigateSpy).not.toHaveBeenCalled();
    });

    it('should clear save errors and recover after a later loading failure', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      await openOffering();
      serviceOfferingStoreStub.update.mockReturnValue(throwError(() => new Error('Saving failed')));
      component.onSubmit();
      expect(component.submitError()).not.toBeNull();
      serviceOfferingStoreStub.getAll
        .mockReturnValueOnce(throwError(() => new Error('Loading failed')))
        .mockReturnValueOnce(of([{ ...hourlyOffering, id: 14 }]));

      expect(
        await harness.navigateByUrl(
          '/service-providers/7/service-offerings/13/edit',
          ServiceOfferingForm,
        ),
      ).toBe(component);

      expect(component.submitError()).toBeNull();
      expect(component.loadError()).toBe(
        'Impossible de charger cette offre de service. Veuillez réessayer.',
      );
      expect(component.isLoading()).toBe(false);
      expect(
        await harness.navigateByUrl(
          '/service-providers/7/service-offerings/14/edit',
          ServiceOfferingForm,
        ),
      ).toBe(component);
      expect(component.loadError()).toBeNull();
      expect(component.isLoading()).toBe(false);
      expect(component.serviceOfferingForm.controls.title.value).toBe(hourlyOffering.title);
      expect(harness.routeNativeElement!.querySelector('form')).not.toBeNull();
    });

    it('should preserve the draft when the provider and offering ids remain the same', async () => {
      await openOffering();
      const controls = component.serviceOfferingForm.controls;
      controls.title.setValue('Brouillon conservé');
      controls.title.markAsDirty();
      controls.title.markAsTouched();
      controls.pricingType.setValue(ServicePricingType.FREE);

      expect(
        await harness.navigateByUrl(
          '/service-providers/7/service-offerings/12/edit;tab=pricing?source=menu',
          ServiceOfferingForm,
        ),
      ).toBe(component);

      expect(serviceProviderStoreStub.getById).toHaveBeenCalledTimes(1);
      expect(serviceOfferingStoreStub.getAll).toHaveBeenCalledTimes(1);
      expect(controls.title.value).toBe('Brouillon conservé');
      expect(controls.title.dirty).toBe(true);
      expect(controls.title.touched).toBe(true);
      expect(controls.pricingType.value).toBe(ServicePricingType.FREE);
      expect(controls.hourlyRate.value).toBeNull();
    });

    it.each([
      { mode: 'create', outcome: 'success' },
      { mode: 'create', outcome: 'error' },
      { mode: 'edit', outcome: 'success' },
      { mode: 'edit', outcome: 'error' },
    ] as const)(
      'should cancel a pending $mode and ignore its late $outcome after context changes',
      async ({ mode, outcome }) => {
        if (mode === 'edit') {
          await openOffering();
        } else {
          component.serviceOfferingForm.patchValue({
            title: 'Nouvelle offre',
            description: 'Description valide',
          });
        }
        const response = new Subject<ServiceOffering>();
        const stopped = vi.fn();
        const save =
          mode === 'edit' ? serviceOfferingStoreStub.update : serviceOfferingStoreStub.add;
        save.mockReturnValueOnce(response.pipe(finalize(stopped)));
        const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
        component.onSubmit();
        expect(component.isSubmitting()).toBe(true);
        expect(stopped).not.toHaveBeenCalled();
        const next = { ...hourlyOffering, id: 13, title: 'Autre offre' };
        if (mode === 'edit') serviceOfferingStoreStub.getAll.mockReturnValueOnce(of([next]));
        const destination =
          mode === 'edit'
            ? '/service-providers/7/service-offerings/13/edit'
            : '/service-providers/8/service-offerings/new';

        expect(await harness.navigateByUrl(destination, ServiceOfferingForm)).toBe(component);

        expect(stopped).toHaveBeenCalledTimes(1);
        expect(component.isSubmitting()).toBe(false);
        component.serviceOfferingForm.controls.title.setValue('Nouveau brouillon');
        if (outcome === 'success') {
          response.next(hourlyOffering);
          response.complete();
        } else {
          response.error(new Error('Old save failed'));
        }
        expect(component.serviceOfferingForm.controls.title.value).toBe('Nouveau brouillon');
        expect(component.submitError()).toBeNull();
        expect(component.isSubmitting()).toBe(false);
        expect(router.url).toBe(destination);
        expect(navigateSpy).not.toHaveBeenCalled();
      },
    );
  });

  describe('edit authorization', () => {
    const offering: ServiceOffering = {
      id: 12,
      serviceProviderId: 7,
      title: 'Conseil plomberie',
      description: 'Conseils pour entretenir votre installation.',
      pricingType: ServicePricingType.HOURLY,
      hourlyRate: 35,
    };

    async function openEditForm() {
      serviceOfferingStoreStub.getAll.mockReturnValue(of([offering]));
      component = await harness.navigateByUrl(
        '/service-providers/7/service-offerings/12/edit',
        ServiceOfferingForm,
      );
      harness.detectChanges();
    }

    it('should redirect an unauthenticated editor to login without requesting data', async () => {
      authSessionStub.currentUser.mockReturnValue(null);
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      await openEditForm();

      expect(navigateSpy).toHaveBeenCalledExactlyOnceWith(['/login']);
      expect(serviceProviderStoreStub.getById).not.toHaveBeenCalled();
      expect(serviceOfferingStoreStub.getAll).not.toHaveBeenCalled();
      expect(component.loadError()).toBe('Vous devez être connecté pour modifier cette offre.');
      expect(harness.routeNativeElement?.querySelector('form')).toBeNull();
    });

    it.each([
      { label: 'another account', ownerUserId: 99 },
      { label: 'no account', ownerUserId: null },
    ])(
      'should reject editing a provider owned by $label and block submission',
      async ({ ownerUserId }) => {
        serviceProviderStoreStub.getById.mockReturnValue(of({ ...providerMock, ownerUserId }));
        const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

        await openEditForm();

        expect(navigateSpy).toHaveBeenCalledExactlyOnceWith(['/service-providers', 7]);
        expect(component.loadError()).toBe('Vous ne pouvez pas modifier cette offre de service.');
        expect(component.serviceOfferingForm.controls.title.value).toBe('');
        expect(component.isLoading()).toBe(false);
        expect(harness.routeNativeElement?.querySelector('form')).toBeNull();
        component.serviceOfferingForm.patchValue({
          title: 'Titre valide',
          description: 'Description valide',
          hourlyRate: 20,
        });
        expect(component.serviceOfferingForm.valid).toBe(true);
        component.onSubmit();
        expect(serviceOfferingStoreStub.update).not.toHaveBeenCalled();
        expect(serviceOfferingStoreStub.add).not.toHaveBeenCalled();
      },
    );

    it('should show a loading error when the provider request fails', async () => {
      serviceProviderStoreStub.getById.mockReturnValue(
        throwError(() => new Error('Provider unavailable')),
      );
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      await openEditForm();

      expect(component.isLoading()).toBe(false);
      expect(component.loadError()).toBe(
        'Impossible de charger cette offre de service. Veuillez réessayer.',
      );
      expect(component.serviceOfferingForm.controls.title.value).toBe('');
      expect(harness.routeNativeElement?.querySelector('form')).toBeNull();
      expect(navigateSpy).not.toHaveBeenCalled();
    });

    it('should wait for both requests to complete before checking ownership and prefilling', async () => {
      const providerResponse$ = new Subject<ServiceProvider>();
      const offeringsResponse$ = new Subject<ServiceOffering[]>();
      serviceProviderStoreStub.getById.mockReturnValue(providerResponse$);
      serviceOfferingStoreStub.getAll.mockReturnValue(offeringsResponse$);
      component = await harness.navigateByUrl(
        '/service-providers/7/service-offerings/12/edit',
        ServiceOfferingForm,
      );

      expect(serviceProviderStoreStub.getById).toHaveBeenCalledExactlyOnceWith(7);
      expect(serviceOfferingStoreStub.getAll).toHaveBeenCalledExactlyOnceWith(7);
      offeringsResponse$.next([offering]);
      offeringsResponse$.complete();
      providerResponse$.next(providerMock);
      expect(component.isLoading()).toBe(true);
      expect(component.serviceOfferingForm.controls.title.value).toBe('');

      providerResponse$.complete();
      harness.detectChanges();

      expect(component.isLoading()).toBe(false);
      expect(component.loadError()).toBeNull();
      expect(component.serviceOfferingForm.controls.title.value).toBe(offering.title);
      expect(component.serviceOfferingForm.controls.hourlyRate.value).toBe(35);
      expect(harness.routeNativeElement?.querySelector('form')).not.toBeNull();
    });
  });
});
