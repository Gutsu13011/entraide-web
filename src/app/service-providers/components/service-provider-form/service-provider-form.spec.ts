import { TestBed } from '@angular/core/testing';
import { ServiceProviderForm } from './service-provider-form';
import { provideRouter, Router } from '@angular/router';
import { CurrentUserResponse } from '../../../models/auth.model';
import { AuthSession } from '../../../auth/services/auth-session';
import { RouterTestingHarness } from '@angular/router/testing';
import { ServiceProviderStore } from '../../services/service-provider-store';
import { ServiceProvider } from '../../../models/service-provider.model';
import { finalize, Subject, of, throwError } from 'rxjs';

describe('ServiceProviderForm', () => {
  let component: ServiceProviderForm;
  let harness: RouterTestingHarness;

  const authSessionStub = {
    currentUser: vi.fn(),
  };
  const currentUser: CurrentUserResponse = {
    id: 7,
    firstName: 'Alice',
    lastName: 'Martin',
    email: 'alicemartin@mail.com',
  };
  const serviceProviderStoreStub = {
    getById: vi.fn(),
    add: vi.fn(),
    update: vi.fn(),
  };
  const mockServiceProvider: ServiceProvider = {
    id: 12,
    ownerUserId: currentUser.id,
    firstName: 'Alice',
    lastName: 'Martin',
    profession: 'Plombier',
    city: 'Lyon',
    description: 'Une description suffisamment longue pour être valide.',
    hourlyRate: 35,
    imageUrl: '',
    available: true,
  };

  beforeEach(async () => {
    authSessionStub.currentUser.mockReset().mockReturnValue(currentUser);
    serviceProviderStoreStub.getById.mockReset();
    serviceProviderStoreStub.add.mockReset();
    serviceProviderStoreStub.update.mockReset();

    await TestBed.configureTestingModule({
      imports: [ServiceProviderForm],
      providers: [
        provideRouter([
          { path: 'service-providers/new', component: ServiceProviderForm },
          { path: 'service-providers/:id/edit', component: ServiceProviderForm },
        ]),
        { provide: AuthSession, useValue: authSessionStub },
        { provide: ServiceProviderStore, useValue: serviceProviderStoreStub },
      ],
    }).compileComponents();

    harness = await RouterTestingHarness.create();
    component = await harness.navigateByUrl('/service-providers/new', ServiceProviderForm);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should prefill read-only name fields from the authenticated account', () => {
    expect(component.isLoading()).toBe(false);
    expect(component.isEditMode).toBe(false);
    expect(harness.routeNativeElement!.querySelector('form')).not.toBeNull();
    expect(harness.routeNativeElement!.querySelector('[role="status"]')).toBeNull();

    const firstNameControl = component.serviceProviderForm.controls.firstName;
    const firstNameHtml = harness.routeNativeElement!.querySelector<HTMLInputElement>('#firstName');
    const lastNameControl = component.serviceProviderForm.controls.lastName;
    const lastNameHtml = harness.routeNativeElement!.querySelector<HTMLInputElement>('#lastName');

    expect(firstNameControl.value).toBe('Alice');
    expect(lastNameControl.value).toBe('Martin');
    expect(firstNameHtml!.readOnly).toBe(true);
    expect(lastNameHtml!.readOnly).toBe(true);
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

  it('should show loading then prefill the edit form when the provider arrives', async () => {
    const providerResponse$ = new Subject<ServiceProvider>();

    serviceProviderStoreStub.getById.mockReturnValue(providerResponse$.asObservable());
    component = await harness.navigateByUrl('/service-providers/12/edit', ServiceProviderForm);
    harness.detectChanges();
    expect(serviceProviderStoreStub.getById).toHaveBeenCalledWith(mockServiceProvider.id);
    expect(component.isLoading()).toBe(true);
    expect(harness.routeNativeElement!.querySelector('[role="status"]')?.textContent).toBe(
      'Chargement de la fiche...',
    );
    expect(harness.routeNativeElement!.querySelector('form')).toBeNull();
    providerResponse$.next(mockServiceProvider);
    providerResponse$.complete();
    harness.detectChanges();
    expect(component.isLoading()).toBe(false);
    expect(harness.routeNativeElement!.querySelector('[role="status"]')).toBeNull();
    expect(harness.routeNativeElement!.querySelector('form')).not.toBeNull();
    expect(component.serviceProviderForm.controls.city.value).toBe('Lyon');
    expect(component.serviceProviderForm.controls.hourlyRate.value).toBe(35);
  });

  it('should update the existing provider and navigate back to its detail page', async () => {
    const updatedProvider = { ...mockServiceProvider, city: 'Marseille' };

    serviceProviderStoreStub.getById.mockReturnValue(of(mockServiceProvider));
    serviceProviderStoreStub.update.mockReturnValue(of(updatedProvider));
    component = await harness.navigateByUrl('/service-providers/12/edit', ServiceProviderForm);
    harness.detectChanges();
    component.serviceProviderForm.controls.city.setValue(updatedProvider.city);

    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    component.onSubmit();
    expect(serviceProviderStoreStub.update).toHaveBeenCalledWith(
      12,
      expect.objectContaining({ city: 'Marseille' }),
    );
    expect(serviceProviderStoreStub.add).not.toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith(['/service-providers', 12]);
    expect(component.isSubmitting()).toBe(false);
  });

  it('should show a load error and prevent submission when the provider cannot be loaded', async () => {
    serviceProviderStoreStub.getById.mockReturnValue(
      throwError(() => new Error('Chargement impossible')),
    );
    component = await harness.navigateByUrl('/service-providers/12/edit', ServiceProviderForm);
    harness.detectChanges();
    expect(component.isLoading()).toBe(false);
    expect(component.loadError()).toBe('Impossible de charger cette fiche. Veuillez réessayer.');
    expect(
      harness.routeNativeElement!.querySelector<HTMLElement>('[role="alert"]')?.textContent,
    ).toBe('Impossible de charger cette fiche. Veuillez réessayer.');
    expect(harness.routeNativeElement!.querySelector('form')).toBeNull();
    component.serviceProviderForm.patchValue(mockServiceProvider);
    expect(component.serviceProviderForm.valid).toBe(true);
    component.onSubmit();
    expect(serviceProviderStoreStub.add).not.toHaveBeenCalled();
    expect(serviceProviderStoreStub.update).not.toHaveBeenCalled();
  });

  it('should retain changes and allow retry after an update failure', async () => {
    const updatedProvider = { ...mockServiceProvider, city: 'Marseille' };

    serviceProviderStoreStub.getById.mockReturnValue(of(mockServiceProvider));
    serviceProviderStoreStub.update
      .mockReturnValueOnce(throwError(() => new Error('Enregistrement impossible')))
      .mockReturnValueOnce(of(updatedProvider));
    component = await harness.navigateByUrl('/service-providers/12/edit', ServiceProviderForm);
    component.serviceProviderForm.controls.city.setValue(updatedProvider.city);

    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    component.onSubmit();
    harness.detectChanges();
    expect(component.isSubmitting()).toBe(false);
    expect(
      harness.routeNativeElement!.querySelector<HTMLElement>('[role="alert"]')?.textContent,
    ).toBe('Impossible d’enregistrer cette fiche. Veuillez réessayer.');
    expect(harness.routeNativeElement!.querySelector('form')).not.toBeNull();
    expect(component.serviceProviderForm.controls.city.value).toBe('Marseille');
    expect(navigateSpy).not.toHaveBeenCalled();
    component.onSubmit();
    harness.detectChanges();
    expect(serviceProviderStoreStub.update).toHaveBeenCalledTimes(2);
    expect(component.submitError()).toBeNull();
    expect(navigateSpy).toHaveBeenCalledWith(['/service-providers', 12]);
  });

  it('should create a provider without sending its id or owner and navigate to its detail page', () => {
    serviceProviderStoreStub.add.mockReturnValue(of(mockServiceProvider));
    component.serviceProviderForm.patchValue(mockServiceProvider);
    const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    component.onSubmit();

    expect(serviceProviderStoreStub.add).toHaveBeenCalledTimes(1);
    expect(serviceProviderStoreStub.update).not.toHaveBeenCalled();
    const submittedPayload = serviceProviderStoreStub.add.mock.calls[0][0];
    expect(submittedPayload).toEqual(
      expect.objectContaining({ city: 'Lyon', profession: 'Plombier' }),
    );
    expect(submittedPayload).not.toHaveProperty('id');
    expect(submittedPayload).not.toHaveProperty('ownerUserId');
    expect(navigateSpy).toHaveBeenCalledWith(['/service-providers', mockServiceProvider.id]);
    expect(component.isSubmitting()).toBe(false);
  });

  it.each([currentUser.id, 99])(
    'should cancel edit loading on departure and ignore a late provider owned by %s',
    async (ownerUserId) => {
      const providerResponse = new Subject<ServiceProvider>();
      const requestFinalized = vi.fn();
      serviceProviderStoreStub.getById.mockReturnValue(
        providerResponse.pipe(finalize(requestFinalized)),
      );
      component = await harness.navigateByUrl('/service-providers/12/edit', ServiceProviderForm);
      const abandonedForm = component;
      const originalValues = abandonedForm.serviceProviderForm.getRawValue();
      const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      expect(abandonedForm.isLoading()).toBe(true);
      expect(requestFinalized).not.toHaveBeenCalled();

      await harness.navigateByUrl('/service-providers/new', ServiceProviderForm);

      expect(requestFinalized).toHaveBeenCalledTimes(1);
      expect(abandonedForm.isLoading()).toBe(false);

      providerResponse.next({ ...mockServiceProvider, ownerUserId });
      providerResponse.complete();

      expect(abandonedForm.serviceProviderForm.getRawValue()).toEqual(originalValues);
      expect(navigateSpy).not.toHaveBeenCalled();
    },
  );

  it.each(['create', 'update'] as const)(
    'should cancel a pending %s on departure without navigating on its late response',
    async (mode) => {
      const savedProviderResponse = new Subject<ServiceProvider>();
      const requestFinalized = vi.fn();
      const save =
        mode === 'create' ? serviceProviderStoreStub.add : serviceProviderStoreStub.update;
      save.mockReturnValue(savedProviderResponse.pipe(finalize(requestFinalized)));
      serviceProviderStoreStub.getById.mockReturnValue(of(mockServiceProvider));

      if (mode === 'update') {
        component = await harness.navigateByUrl('/service-providers/12/edit', ServiceProviderForm);
      }
      const abandonedForm = component;
      abandonedForm.serviceProviderForm.patchValue(mockServiceProvider);
      const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      abandonedForm.onSubmit();

      expect(save).toHaveBeenCalledTimes(1);
      expect(abandonedForm.isSubmitting()).toBe(true);
      expect(requestFinalized).not.toHaveBeenCalled();

      const destination =
        mode === 'create' ? '/service-providers/12/edit' : '/service-providers/new';
      await harness.navigateByUrl(destination, ServiceProviderForm);

      expect(requestFinalized).toHaveBeenCalledTimes(1);
      expect(abandonedForm.isSubmitting()).toBe(false);

      savedProviderResponse.next(mockServiceProvider);
      savedProviderResponse.complete();

      expect(navigateSpy).not.toHaveBeenCalled();
      expect(abandonedForm.submitError()).toBeNull();
    },
  );

  describe('navigation between edit forms', () => {
    const nextProvider: ServiceProvider = {
      ...mockServiceProvider,
      id: 13,
      city: 'Bordeaux',
      profession: 'Électricien',
      hourlyRate: 48,
    };

    it('should reuse the form, reset the old draft and save using the new provider id', async () => {
      serviceProviderStoreStub.getById.mockReturnValueOnce(of(mockServiceProvider));
      component = await harness.navigateByUrl('/service-providers/12/edit', ServiceProviderForm);
      const form = component.serviceProviderForm;
      form.controls.city.setValue('Brouillon précédent');
      form.controls.city.markAsDirty();
      form.controls.city.markAsTouched();
      const nextResponse = new Subject<ServiceProvider>();
      serviceProviderStoreStub.getById.mockReturnValueOnce(nextResponse);
      const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      expect(await harness.navigateByUrl('/service-providers/13/edit', ServiceProviderForm)).toBe(
        component,
      );

      expect(component.serviceProviderId).toBe(13);
      expect(component.isEditMode).toBe(true);
      expect(serviceProviderStoreStub.getById).toHaveBeenLastCalledWith(13);
      expect(component.isLoading()).toBe(true);
      expect(form.controls.city.value).toBe('');
      expect(form.controls.hourlyRate.value).toBeNull();
      expect(form.pristine).toBe(true);
      expect(form.untouched).toBe(true);
      expect(harness.routeNativeElement!.querySelector('form')).toBeNull();
      expect(harness.routeNativeElement!.querySelector('a')?.getAttribute('href')).toBe(
        '/service-providers/13',
      );
      component.onSubmit();
      expect(serviceProviderStoreStub.update).not.toHaveBeenCalled();

      nextResponse.next(nextProvider);
      nextResponse.complete();
      harness.detectChanges();
      expect(component.isLoading()).toBe(false);
      expect(form.controls.city.value).toBe('Bordeaux');
      expect(form.controls.profession.value).toBe('Électricien');
      expect(harness.routeNativeElement!.querySelector<HTMLInputElement>('#city')?.value).toBe(
        'Bordeaux',
      );
      form.controls.city.setValue('Nantes');
      serviceProviderStoreStub.update.mockReturnValue(of({ ...nextProvider, city: 'Nantes' }));
      component.onSubmit();

      expect(serviceProviderStoreStub.update).toHaveBeenCalledWith(
        13,
        expect.objectContaining({ city: 'Nantes', profession: 'Électricien', hourlyRate: 48 }),
      );
      expect(serviceProviderStoreStub.add).not.toHaveBeenCalled();
      expect(navigateSpy).toHaveBeenCalledWith(['/service-providers', 13]);
    });

    it.each([currentUser.id, 99])(
      'should cancel the old load and ignore its late response owned by %s',
      async (ownerUserId) => {
        const oldResponse = new Subject<ServiceProvider>();
        const newResponse = new Subject<ServiceProvider>();
        const stopped = vi.fn();
        serviceProviderStoreStub.getById
          .mockReturnValueOnce(oldResponse.pipe(finalize(stopped)))
          .mockReturnValueOnce(newResponse);
        component = await harness.navigateByUrl('/service-providers/12/edit', ServiceProviderForm);
        const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
        expect(stopped).not.toHaveBeenCalled();

        expect(await harness.navigateByUrl('/service-providers/13/edit', ServiceProviderForm)).toBe(
          component,
        );

        expect(stopped).toHaveBeenCalledTimes(1);
        expect(component.isLoading()).toBe(true);
        newResponse.next(nextProvider);
        newResponse.complete();
        oldResponse.next({ ...mockServiceProvider, ownerUserId });
        oldResponse.complete();
        harness.detectChanges();

        expect(component.isLoading()).toBe(false);
        expect(component.serviceProviderForm.controls.city.value).toBe('Bordeaux');
        expect(component.serviceProviderId).toBe(13);
        expect(component.loadError()).toBeNull();
        expect(navigateSpy).not.toHaveBeenCalled();
      },
    );

    it('should clear save and load errors on later provider changes and recover the loading stream', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      serviceProviderStoreStub.getById
        .mockReturnValueOnce(of(mockServiceProvider))
        .mockReturnValueOnce(throwError(() => new Error('Loading failed')))
        .mockReturnValueOnce(of({ ...nextProvider, id: 14 }));
      serviceProviderStoreStub.update.mockReturnValue(throwError(() => new Error('Saving failed')));
      component = await harness.navigateByUrl('/service-providers/12/edit', ServiceProviderForm);
      component.onSubmit();
      expect(component.submitError()).not.toBeNull();

      expect(await harness.navigateByUrl('/service-providers/13/edit', ServiceProviderForm)).toBe(
        component,
      );

      expect(component.submitError()).toBeNull();
      expect(component.loadError()).toBe('Impossible de charger cette fiche. Veuillez réessayer.');
      expect(component.isLoading()).toBe(false);
      expect(harness.routeNativeElement!.querySelector('form')).toBeNull();
      expect(await harness.navigateByUrl('/service-providers/14/edit', ServiceProviderForm)).toBe(
        component,
      );
      expect(component.loadError()).toBeNull();
      expect(component.submitError()).toBeNull();
      expect(component.isLoading()).toBe(false);
      expect(component.serviceProviderId).toBe(14);
      expect(harness.routeNativeElement!.querySelector<HTMLInputElement>('#city')?.value).toBe(
        'Bordeaux',
      );
    });

    it('should preserve the draft when other route parameters change without changing the provider id', async () => {
      serviceProviderStoreStub.getById.mockReturnValue(of(mockServiceProvider));
      component = await harness.navigateByUrl('/service-providers/12/edit', ServiceProviderForm);
      const city = component.serviceProviderForm.controls.city;
      city.setValue('Brouillon conservé');
      city.markAsDirty();
      city.markAsTouched();

      expect(
        await harness.navigateByUrl(
          '/service-providers/12/edit;tab=profile?source=menu',
          ServiceProviderForm,
        ),
      ).toBe(component);

      expect(serviceProviderStoreStub.getById).toHaveBeenCalledTimes(1);
      expect(city.value).toBe('Brouillon conservé');
      expect(city.dirty).toBe(true);
      expect(city.touched).toBe(true);
    });

    it.each(['success', 'error'] as const)(
      'should cancel an old save and ignore its late %s without affecting the next form',
      async (outcome) => {
        serviceProviderStoreStub.getById
          .mockReturnValueOnce(of(mockServiceProvider))
          .mockReturnValueOnce(of(nextProvider));
        const saveResponse = new Subject<ServiceProvider>();
        const stopped = vi.fn();
        serviceProviderStoreStub.update.mockReturnValueOnce(saveResponse.pipe(finalize(stopped)));
        component = await harness.navigateByUrl('/service-providers/12/edit', ServiceProviderForm);
        const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
        component.onSubmit();
        expect(component.isSubmitting()).toBe(true);
        expect(stopped).not.toHaveBeenCalled();

        expect(await harness.navigateByUrl('/service-providers/13/edit', ServiceProviderForm)).toBe(
          component,
        );

        expect(stopped).toHaveBeenCalledTimes(1);
        expect(component.isSubmitting()).toBe(false);
        component.serviceProviderForm.controls.city.setValue('Nouveau brouillon');
        if (outcome === 'success') {
          saveResponse.next(mockServiceProvider);
          saveResponse.complete();
        } else {
          saveResponse.error(new Error('Old save failed'));
        }
        harness.detectChanges();

        expect(component.serviceProviderId).toBe(13);
        expect(component.serviceProviderForm.controls.city.value).toBe('Nouveau brouillon');
        expect(component.submitError()).toBeNull();
        expect(component.isSubmitting()).toBe(false);
        expect(navigateSpy).not.toHaveBeenCalled();
        expect(TestBed.inject(Router).url).toBe('/service-providers/13/edit');
      },
    );
  });

  it.each([99, null])(
    'should redirect to the detail page when ownerUserId is %s',
    async (ownerUserId) => {
      serviceProviderStoreStub.getById.mockReturnValue(of({ ...mockServiceProvider, ownerUserId }));
      const navigateSpy = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

      component = await harness.navigateByUrl('/service-providers/12/edit', ServiceProviderForm);
      harness.detectChanges();

      expect(navigateSpy).toHaveBeenCalledTimes(1);
      expect(navigateSpy).toHaveBeenCalledWith(['/service-providers', mockServiceProvider.id]);
      expect(component.serviceProviderForm.controls.city.value).toBe('');
      expect(component.serviceProviderForm.controls.profession.value).toBe('');
      expect(serviceProviderStoreStub.add).not.toHaveBeenCalled();
      expect(serviceProviderStoreStub.update).not.toHaveBeenCalled();
    },
  );
});
