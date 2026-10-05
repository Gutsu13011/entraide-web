import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthSession } from '../services/auth-session';

export const authGuard: CanActivateFn = (route, state) => {
  const authSession = inject(AuthSession);
  const router = inject(Router);

  if (authSession.isAuthenticated()) {
    return true;
  }
  return router.createUrlTree(['/login']);
};
