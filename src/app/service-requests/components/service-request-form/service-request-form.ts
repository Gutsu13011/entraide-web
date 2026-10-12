import { Component, inject, signal, OnInit } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ServiceOfferingStore } from '../../../service-offerings/services/service-offering-store';
import { ServiceOffering, ServicePricingType } from '../../../models/service-offering.model';
import { finalize } from 'rxjs';
import { ServiceRequestStore } from '../../services/service-request-store';

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

  readonly isSubmitting = signal<boolean>(false);
  readonly submitError = signal<string | null>(null);
  readonly serviceRequestForm = new FormGroup({
    message: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/)],
    }),
  });
  readonly serviceProviderId = Number(this.route.snapshot.paramMap.get('id'));
  readonly serviceOfferingId = Number(this.route.snapshot.paramMap.get('offeringId'));
  readonly serviceOffering = signal<ServiceOffering | null>(null);
  readonly isLoading = signal<boolean>(false);
  readonly loadError = signal<string | null>(null);
  readonly servicePricingType = ServicePricingType;

  ngOnInit(): void {
    this.isLoading.set(true);
    this.serviceOfferingStore
      .getAll(this.serviceProviderId)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (serviceOfferings) => {
          const serviceOffering = serviceOfferings.find((so) => so.id === this.serviceOfferingId);

          if (serviceOffering === undefined) {
            this.loadError.set('Cette offre de service est introuvable.');
            return;
          }

          this.serviceOffering.set(serviceOffering);
        },
        error: (error) => {
          this.loadError.set('Impossible de charger cette offre de service. Veuillez réessayer.');
        },
      });
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
      .pipe(finalize(() => this.isSubmitting.set(false)))
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
