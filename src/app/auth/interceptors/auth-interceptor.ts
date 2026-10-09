import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthSession } from '../services/auth-session';
import { catchError, throwError } from 'rxjs';

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

  return next(req.clone({ setHeaders: { Authorization: `Bearer ${accessToken}` } })).pipe(
    catchError((error) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === 401 &&
        authSession.accessToken() === accessToken
      ) {
        authSession.logout();
      }

      return throwError(() => error);
    }),
  );
};
