import { Component, inject, signal } from '@angular/core';
import type { OnInit } from '@angular/core';
import { FormControl, ReactiveFormsModule, FormGroup, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ServiceProviderStore } from '../../services/service-provider-store';
import { finalize } from 'rxjs';
import { AuthSession } from '../../../auth/services/auth-session';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  selector: 'app-service-provider-form',
  styleUrl: './service-provider-form.scss',
  templateUrl: './service-provider-form.html',
})
export class ServiceProviderForm implements OnInit {
  private readonly serviceProviderStore = inject(ServiceProviderStore);
  private readonly router = inject(Router);
  private readonly authSession = inject(AuthSession);

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

  ngOnInit(): void {
    const currentUser = this.authSession.currentUser();

    if (currentUser === null) {
      return;
    }

    this.serviceProviderForm.patchValue({
      firstName: currentUser.firstName,
      lastName: currentUser.lastName,
    });
  }

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
