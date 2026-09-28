import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, FormGroup, Validators } from '@angular/forms';
import { CreateServiceOffering, ServicePricingType } from '../../../models/service-offering.model';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ServiceOfferingStore } from '../../services/service-offering-store';
import { finalize } from 'rxjs';

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
  readonly serviceProviderId: number = Number(this.route.snapshot.paramMap.get('id'));

  ngOnInit() {
    const serviceOfferingControl = this.serviceOfferingForm.controls;
    serviceOfferingControl.pricingType.valueChanges.subscribe((value) => {
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

    this.isSubmitting.set(true);
    this.submitError.set(null);
    this.serviceOfferingStore
      .add(this.serviceProviderId, data)
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: ({ serviceProviderId }) => {
          this.router.navigate(['/service-providers', serviceProviderId]);
        },
        error: (error) => {
          console.error('error in serviceOfferingForm', error);
          this.submitError.set('Impossible d’ajouter cette offre de service. Veuillez réessayer.');
        },
      });
  }
}
