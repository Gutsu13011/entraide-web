import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthSession } from '../services/auth-session';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authSession = inject(AuthSession);
  const accessToken = authSession.accessToken();

  try {
    const address = new URL(req.url);

    if (address.origin !== 'http://localhost:3000') {
      return next(req);
    }
  } catch {
    return next(req);
  }

  if (req.headers.has('Authorization') || !accessToken) {
    return next(req);
  }

  return next(req.clone({ setHeaders: { Authorization: `Bearer ${accessToken}` } }));
};
