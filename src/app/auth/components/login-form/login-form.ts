import { Component, effect, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthSession } from '../../services/auth-session';
import { ActivatedRoute, PRIMARY_OUTLET, Router, UrlTree } from '@angular/router';

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
        this.router.navigateByUrl(this.getReturnUrl(), { replaceUrl: true });
      }
    });
  }

  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

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

  private getReturnUrl(): UrlTree {
    const fallback = this.router.parseUrl('/');
    const destination = this.route.snapshot.queryParamMap.get('returnUrl');

    if (
      !destination ||
      !destination.startsWith('/') ||
      destination.startsWith('//') ||
      destination.includes('\\')
    ) {
      return fallback;
    }

    const target = this.router.parseUrl(destination);
    const firstSegment = target.root.children[PRIMARY_OUTLET]?.segments[0]?.path;

    if (firstSegment === 'login' || firstSegment === 'register') {
      return fallback;
    }

    return target;
  }

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
