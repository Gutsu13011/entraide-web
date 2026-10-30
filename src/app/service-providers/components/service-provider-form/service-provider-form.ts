import { Component, DestroyRef, inject, signal } from '@angular/core';
import type { OnInit } from '@angular/core';
import { FormControl, ReactiveFormsModule, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ServiceProviderStore } from '../../services/service-provider-store';
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
import { AuthSession } from '../../../auth/services/auth-session';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

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
  private readonly destroyRef = inject(DestroyRef);
  private readonly providerChange$ = new Subject<void>();

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
  readonly isLoading = signal<boolean>(false);
  readonly loadError = signal<string | null>(null);

  serviceProviderId: number | null = null;

  get isEditMode(): boolean {
    return this.serviceProviderId !== null;
  }

  ngOnInit(): void {
    const currentUser = this.authSession.currentUser();

    if (currentUser === null) {
      return;
    }

    this.route.paramMap
      .pipe(
        map((params) => {
          const id = params.get('id');

          return id === null ? null : Number(id);
        }),
        distinctUntilChanged(),
        switchMap((id) => {
          this.providerChange$.next();
          this.serviceProviderId = id;
          this.loadError.set(null);
          this.submitError.set(null);
          this.serviceProviderForm.reset();

          if (id === null) {
            this.isLoading.set(false);
            this.serviceProviderForm.patchValue({
              firstName: currentUser.firstName,
              lastName: currentUser.lastName,
            });

            return EMPTY;
          }

          this.isLoading.set(true);

          return this.serviceProviderStore.getById(id).pipe(
            tap((serviceProvider) => {
              if (serviceProvider.ownerUserId === currentUser.id) {
                this.serviceProviderForm.patchValue(serviceProvider);
              } else {
                this.router.navigate(['/service-providers', serviceProvider.id]);
              }
            }),
            catchError(() => {
              this.loadError.set('Impossible de charger cette fiche. Veuillez réessayer.');

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
    request$
      .pipe(
        takeUntil(this.providerChange$),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isSubmitting.set(false)),
      )
      .subscribe({
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
