import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthSession } from '../services/auth-session';
import { catchError, of, switchMap, throwError } from 'rxjs';
import { API_ORIGIN } from '../../../api.config';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authSession = inject(AuthSession);
  const accessToken = authSession.accessToken();
  const currentUser = authSession.currentUser();

  try {
    const address = new URL(req.url);

    if (address.origin !== API_ORIGIN) {
      return next(req);
    }

    const authenticationPaths = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

    if (req.method === 'POST' && authenticationPaths.includes(address.pathname)) {
      return next(req);
    }
  } catch {
    return next(req);
  }

  if (req.headers.has('Authorization') || !accessToken) {
    return next(req);
  }

  const isSameSession = () => currentUser !== null && authSession.currentUser() === currentUser;
  const retryWithToken = (token: string) =>
    next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })).pipe(
      catchError((error) => {
        if (
          error instanceof HttpErrorResponse &&
          error.status === 401 &&
          isSameSession() &&
          authSession.accessToken() === token
        ) {
          authSession.requiredReauthentication();
        }

        return throwError(() => error);
      }),
    );

  return next(req.clone({ setHeaders: { Authorization: `Bearer ${accessToken}` } })).pipe(
    catchError((error) => {
      if (!(error instanceof HttpErrorResponse) || error.status !== 401 || !isSameSession()) {
        return throwError(() => error);
      }

      const latestAccessToken = authSession.accessToken();

      if (latestAccessToken === null) {
        return throwError(() => error);
      }

      const tokenSource =
        latestAccessToken === accessToken ? authSession.renewAccessToken() : of(latestAccessToken);

      return tokenSource.pipe(
        catchError((renewalError) => {
          if (isSameSession() && authSession.accessToken() === accessToken) {
            authSession.requiredReauthentication();
          }

          return throwError(() => renewalError);
        }),
        switchMap((token) => {
          if (!isSameSession() || authSession.accessToken() !== token) {
            return throwError(() => error);
          }

          return retryWithToken(token);
        }),
      );
    }),
  );
};
