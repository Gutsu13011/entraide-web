import { TestBed } from '@angular/core/testing';
import { ServiceProviderForm } from './service-provider-form';
import { provideRouter, Router } from '@angular/router';
import { CurrentUserResponse } from '../../../models/auth.model';
import { AuthSession } from '../../../auth/services/auth-session';
import { RouterTestingHarness } from '@angular/router/testing';
import { ServiceProviderStore } from '../../services/service-provider-store';
import { ServiceProvider } from '../../../models/service-provider.model';
import { Subject, of, throwError } from 'rxjs';

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

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should prefill read-only name fields from the authenticated account', () => {
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
