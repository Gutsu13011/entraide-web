import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, FormGroup, Validators } from '@angular/forms';
import { CreateServiceOffering, ServicePricingType } from '../../../models/service-offering.model';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ServiceOfferingStore } from '../../services/service-offering-store';
import {
  catchError,
  distinctUntilChanged,
  EMPTY,
  finalize,
  forkJoin,
  map,
  Subject,
  switchMap,
  takeUntil,
  tap,
} from 'rxjs';
import { AuthSession } from '../../../auth/services/auth-session';
import { ServiceProviderStore } from '../../../service-providers/services/service-provider-store';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  selector: 'app-service-offering-form',
  styleUrl: './service-offering-form.scss',
  templateUrl: './service-offering-form.html',
})
export class ServiceOfferingForm {
  private readonly route = inject(ActivatedRoute);
  private readonly serviceOfferingStore = inject(ServiceOfferingStore);
  private readonly router = inject(Router);
  private readonly authSession = inject(AuthSession);
  private readonly serviceProviderStore = inject(ServiceProviderStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly offeringChange$ = new Subject<void>();

  readonly servicePricingType = ServicePricingType;
  readonly isSubmitting = signal<boolean>(false);
  readonly submitError = signal<string | null>(null);
  readonly serviceOfferingForm = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
    pricingType: new FormControl<ServicePricingType>(ServicePricingType.HOURLY, {
      nonNullable: true,
      validators: [Validators.required],
    }),
    hourlyRate: new FormControl<number | null>(0.01, {
      nonNullable: false,
      validators: [Validators.min(0.01), Validators.required],
    }),
  });
  readonly isLoading = signal<boolean>(false);
  readonly loadError = signal<string | null>(null);

  serviceProviderId = 0;
  serviceOfferingId: number | null = null;

  get isEditMode(): boolean {
    return this.serviceOfferingId !== null;
  }

  ngOnInit() {
    const serviceOfferingControl = this.serviceOfferingForm.controls;

    serviceOfferingControl.pricingType.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value) => {
        if (value === ServicePricingType.HOURLY) {
          serviceOfferingControl.hourlyRate.setValidators([
            Validators.min(0.01),
            Validators.required,
          ]);
          serviceOfferingControl.hourlyRate.updateValueAndValidity();
        } else {
          serviceOfferingControl.hourlyRate.clearValidators();
          serviceOfferingControl.hourlyRate.reset(null);
        }
      });

    this.route.paramMap
      .pipe(
        map((params) => {
          const offeringId = params.get('offeringId');

          return {
            serviceProviderId: Number(params.get('id')),
            serviceOfferingId: offeringId === null ? null : Number(offeringId),
          };
        }),
        distinctUntilChanged(
          (previous, current) =>
            previous.serviceProviderId === current.serviceProviderId &&
            previous.serviceOfferingId === current.serviceOfferingId,
        ),
        switchMap(({ serviceOfferingId, serviceProviderId }) => {
          this.offeringChange$.next();
          this.serviceProviderId = serviceProviderId;
          this.serviceOfferingId = serviceOfferingId;
          this.isLoading.set(false);
          this.loadError.set(null);
          this.submitError.set(null);
          this.serviceOfferingForm.reset({
            title: '',
            description: '',
            pricingType: ServicePricingType.HOURLY,
            hourlyRate: 0.01,
          });

          if (serviceOfferingId === null) {
            return EMPTY;
          }

          const currentUser = this.authSession.currentUser();

          if (currentUser === null) {
            this.loadError.set('Vous devez être connecté pour modifier cette offre.');
            this.router.navigate(['/login']);

            return EMPTY;
          }

          this.isLoading.set(true);

          return forkJoin({
            serviceProvider: this.serviceProviderStore.getById(serviceProviderId),
            serviceOfferings: this.serviceOfferingStore.getAll(serviceProviderId),
          }).pipe(
            tap(({ serviceProvider, serviceOfferings }) => {
              if (serviceProvider.ownerUserId !== currentUser.id) {
                this.loadError.set('Vous ne pouvez pas modifier cette offre de service.');
                this.router.navigate(['/service-providers', serviceProvider.id]);
                return;
              }

              const offering = serviceOfferings.find(
                (offering) => offering.id === this.serviceOfferingId,
              );

              if (offering === undefined) {
                this.loadError.set('Cette offre de service est introuvable.');
                return;
              }

              this.serviceOfferingForm.patchValue(offering);
            }),
            catchError(() => {
              this.loadError.set(
                'Impossible de charger cette offre de service. Veuillez réessayer.',
              );

              return EMPTY;
            }),
            finalize(() => this.isLoading.set(false)),
          );
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  private buildCreateServiceOffering(): CreateServiceOffering | null {
    const formValue = this.serviceOfferingForm.getRawValue();

    if (formValue.pricingType === ServicePricingType.HOURLY) {
      if (formValue.hourlyRate !== null) {
        return {
          title: formValue.title,
          description: formValue.description,
          pricingType: ServicePricingType.HOURLY,
          hourlyRate: formValue.hourlyRate,
        };
      }
      return null;
    } else if (formValue.pricingType === ServicePricingType.FREE) {
      return {
        title: formValue.title,
        description: formValue.description,
        pricingType: ServicePricingType.FREE,
      };
    } else {
      return null;
    }
  }

  onSubmit(): void {
    if (this.isLoading() || this.loadError() !== null) {
      return;
    }

    if (this.serviceOfferingForm.invalid) {
      this.serviceOfferingForm.markAllAsTouched();
      return;
    }

    if (this.isSubmitting()) {
      return;
    }

    const data = this.buildCreateServiceOffering();

    if (data === null) {
      return;
    }

    const request$ =
      this.serviceOfferingId !== null
        ? this.serviceOfferingStore.update(this.serviceProviderId, this.serviceOfferingId, data)
        : this.serviceOfferingStore.add(this.serviceProviderId, data);

    this.isSubmitting.set(true);
    this.submitError.set(null);
    request$
      .pipe(
        takeUntil(this.offeringChange$),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isSubmitting.set(false)),
      )
      .subscribe({
        next: ({ serviceProviderId }) => {
          this.router.navigate(['/service-providers', serviceProviderId]);
        },
        error: (error) => {
          console.error('error in serviceOfferingForm', error);
          this.submitError.set(
            'Impossible d’enregistrer cette offre de service. Veuillez réessayer.',
          );
        },
      });
  }
}
