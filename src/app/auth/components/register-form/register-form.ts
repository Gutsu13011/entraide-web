import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthStore } from '../../services/auth-store';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';

@Component({
  imports: [ReactiveFormsModule],
  selector: 'app-register-form',
  styleUrl: './register-form.scss',
  templateUrl: './register-form.html',
})
export class RegisterForm {
  private readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);

  readonly isSubmitting = signal<boolean>(false);
  readonly submitError = signal<string | null>(null);
  readonly registerForm = new FormGroup({
    firstName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    lastName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(15)],
    }),
  });

  onSubmit(): void {
    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      return;
    }

    if (this.isSubmitting()) {
      return;
    }

    const data = this.registerForm.getRawValue();

    this.isSubmitting.set(true);
    this.submitError.set(null);
    this.authStore
      .register(data)
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: () => {
          this.router.navigate(['/login']);
        },
        error: (error) => {
          console.error('error in RegisterForm', error);
          this.submitError.set('Inscription impossible. Veuillez réessayer.');
        },
      });
  }
}
