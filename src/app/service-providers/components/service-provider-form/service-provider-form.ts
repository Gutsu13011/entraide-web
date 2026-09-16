import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, FormGroup, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ServiceProviderStore } from '../../services/service-provider-store';
import { finalize } from 'rxjs';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  selector: 'app-service-provider-form',
  styleUrl: './service-provider-form.scss',
  templateUrl: './service-provider-form.html',
})
export class ServiceProviderForm {
  private readonly serviceProviderStore = inject(ServiceProviderStore);
  private readonly router = inject(Router);

  readonly isSubmitting = signal<boolean>(false);
  readonly submitError = signal<null | string>(null);

  readonly serviceProviderForm = new FormGroup({
    firstName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
    lastName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
    profession: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
    city: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(20)],
    }),
    hourlyRate: new FormControl<number | null>(null, {
      validators: [Validators.required, Validators.min(0.01)],
    }),
    available: new FormControl(true, {
      nonNullable: true,
    }),
    imageUrl: new FormControl('', {
      nonNullable: true,
    }),
  });

  onSubmit(): void {
    if (this.serviceProviderForm.invalid) {
      this.serviceProviderForm.markAllAsTouched();
      return;
    }

    if (this.isSubmitting()) return;

    const formValue = this.serviceProviderForm.getRawValue();

    if (formValue.hourlyRate === null) return;

    this.isSubmitting.set(true);
    this.submitError.set(null);
    this.serviceProviderStore
      .add({
        ...formValue,
        hourlyRate: formValue.hourlyRate,
      })
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: (newServiceProvider) => {
          this.router.navigate(['/service-providers', newServiceProvider.id]);
        },
        error: (error) => {
          console.error('error in ServiceProviderForm', error);
          this.submitError.set('Impossible d’ajouter cet intervenant. Veuillez réessayer.');
        },
      });
  }
}
