import { Component, inject, signal, OnInit, DestroyRef } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ServiceOfferingStore } from '../../../service-offerings/services/service-offering-store';
import { ServiceOffering, ServicePricingType } from '../../../models/service-offering.model';
import {
  catchError,
  distinctUntilChanged,
  EMPTY,
  finalize,
  map,
  Subject,
  switchMap,
  takeUntil,
  tap,
} from 'rxjs';
import { ServiceRequestStore } from '../../services/service-request-store';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  selector: 'app-service-request-form',
  styleUrl: './service-request-form.scss',
  templateUrl: './service-request-form.html',
})
export class ServiceRequestForm implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly serviceOfferingStore = inject(ServiceOfferingStore);
  private readonly serviceRequestStore = inject(ServiceRequestStore);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly offeringChange$ = new Subject<void>();

  readonly isSubmitting = signal<boolean>(false);
  readonly submitError = signal<string | null>(null);
  readonly serviceRequestForm = new FormGroup({
    message: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/)],
    }),
  });
  readonly serviceOffering = signal<ServiceOffering | null>(null);
  readonly isLoading = signal<boolean>(false);
  readonly loadError = signal<string | null>(null);
  readonly servicePricingType = ServicePricingType;

  serviceProviderId = 0;
  serviceOfferingId = 0;

  ngOnInit(): void {
    this.route.paramMap
      .pipe(
        map((params) => ({
          serviceProviderId: Number(params.get('id')),
          serviceOfferingId: Number(params.get('offeringId')),
        })),
        distinctUntilChanged(
          (previous, current) =>
            previous.serviceProviderId === current.serviceProviderId &&
            previous.serviceOfferingId === current.serviceOfferingId,
        ),
        switchMap(({ serviceProviderId, serviceOfferingId }) => {
          this.offeringChange$.next();
          this.serviceProviderId = serviceProviderId;
          this.serviceOfferingId = serviceOfferingId;
          this.isLoading.set(true);
          this.loadError.set(null);
          this.submitError.set(null);
          this.serviceOffering.set(null);
          this.serviceRequestForm.reset();

          return this.serviceOfferingStore.getById(serviceProviderId, serviceOfferingId).pipe(
            tap((serviceOffering) => {
              this.serviceOffering.set(serviceOffering);
            }),
            catchError((error: unknown) => {
              this.loadError.set(
                error instanceof HttpErrorResponse && error.status === 404
                  ? 'Cette offre de service est introuvable.'
                  : 'Impossible de charger cette offre de service. Veuillez réessayer.',
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

  onSubmit(): void {
    if (
      this.isLoading() ||
      this.loadError() !== null ||
      this.serviceOffering() === null ||
      this.isSubmitting()
    ) {
      return;
    }

    if (this.serviceRequestForm.invalid) {
      this.serviceRequestForm.markAllAsTouched();
      return;
    }

    const formValue = this.serviceRequestForm.getRawValue();

    this.isSubmitting.set(true);
    this.submitError.set(null);
    this.serviceRequestStore
      .add(this.serviceProviderId, this.serviceOfferingId, formValue)
      .pipe(
        takeUntil(this.offeringChange$),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isSubmitting.set(false)),
      )
      .subscribe({
        next: () => {
          this.router.navigate(['/service-providers', this.serviceProviderId]);
        },
        error: () => {
          this.submitError.set('Impossible d’envoyer votre demande. Veuillez réessayer.');
        },
      });
  }
}
