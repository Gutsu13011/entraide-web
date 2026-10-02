import { Component, effect, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthSession } from '../../services/auth-session';
import { Router } from '@angular/router';

@Component({
  imports: [ReactiveFormsModule],
  selector: 'app-login-form',
  styleUrl: './login-form.scss',
  templateUrl: './login-form.html',
})
export class LoginForm {
  constructor() {
    effect(() => {
      if (this.authSession.isAuthenticated()) {
        this.router.navigate(['/']);
      }
    });
  }

  private readonly router = inject(Router);

  readonly authSession = inject(AuthSession);
  readonly loginForm = new FormGroup({
    email: new FormControl('', {
      validators: [Validators.required, Validators.email],
      nonNullable: true,
    }),
    password: new FormControl('', {
      validators: [Validators.required],
      nonNullable: true,
    }),
  });

  onSubmit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    if (this.authSession.isLoading()) {
      return;
    }

    const data = this.loginForm.getRawValue();

    this.authSession.login(data);
  }
}
