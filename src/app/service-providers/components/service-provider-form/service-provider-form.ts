import { Component, inject, signal } from '@angular/core';
import type { OnInit } from '@angular/core';
import { FormControl, ReactiveFormsModule, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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
  private readonly route = inject(ActivatedRoute);

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
  readonly serviceProviderId: number | null = this.route.snapshot.paramMap.get('id')
    ? Number(this.route.snapshot.paramMap.get('id'))
    : null;
  readonly isEditMode = this.serviceProviderId !== null;
  readonly isLoading = signal<boolean>(false);
  readonly loadError = signal<string | null>(null);

  ngOnInit(): void {
    const currentUser = this.authSession.currentUser();

    if (currentUser === null) {
      return;
    }

    if (this.serviceProviderId !== null) {
      this.isLoading.set(true);
      this.loadError.set(null);
      this.serviceProviderStore
        .getById(this.serviceProviderId)
        .pipe(finalize(() => this.isLoading.set(false)))
        .subscribe({
          next: (serviceProvider) => {
            if (serviceProvider.ownerUserId === currentUser.id) {
              this.serviceProviderForm.patchValue(serviceProvider);
            } else {
              this.router.navigate(['/service-providers', serviceProvider.id]);
            }
          },
          error: () => {
            this.loadError.set('Impossible de charger cette fiche. Veuillez réessayer.');
          },
        });
      return;
    }

    this.serviceProviderForm.patchValue({
      firstName: currentUser.firstName,
      lastName: currentUser.lastName,
    });
  }

  onSubmit(): void {
    if (this.isLoading() || this.loadError() !== null) return;

    if (this.serviceProviderForm.invalid) {
      this.serviceProviderForm.markAllAsTouched();
      return;
    }

    if (this.isSubmitting()) return;

    const formValue = this.serviceProviderForm.getRawValue();

    if (formValue.hourlyRate === null) return;

    const payload = { ...formValue, hourlyRate: formValue.hourlyRate };
    const request$ =
      this.isEditMode && this.serviceProviderId !== null
        ? this.serviceProviderStore.update(this.serviceProviderId, payload)
        : this.serviceProviderStore.add(payload);

    this.isSubmitting.set(true);
    this.submitError.set(null);
    request$.pipe(finalize(() => this.isSubmitting.set(false))).subscribe({
      next: (savedServiceProvider) => {
        this.router.navigate(['/service-providers', savedServiceProvider.id]);
      },
      error: (error) => {
        console.error('error in ServiceProviderForm', error);
        this.submitError.set('Impossible d’enregistrer cette fiche. Veuillez réessayer.');
      },
    });
  }
}
