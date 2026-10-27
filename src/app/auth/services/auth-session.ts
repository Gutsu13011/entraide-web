import { signalStore, withState, withComputed, withMethods, patchState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import {
  pipe,
  exhaustMap,
  switchMap,
  tap,
  catchError,
  EMPTY,
  Subject,
  takeUntil,
  timeout,
  finalize,
  defer,
  map,
  of,
  Observable,
  shareReplay,
} from 'rxjs';
import { RxMethod, rxMethod } from '@ngrx/signals/rxjs-interop';
import { AuthStore } from './auth-store';
import type { CurrentUserResponse, LoginRequest } from '../../models/auth.model';
import { HttpErrorResponse } from '@angular/common/http';

export type AuthSessionState = {
  accessToken: string | null;
  currentUser: CurrentUserResponse | null;
  isLoading: boolean;
  errorMessage: string | null;
};
const initialState: AuthSessionState = {
  accessToken: null,
  currentUser: null,
  isLoading: false,
  errorMessage: null,
};

export const AuthSession = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed((store) => ({
    isAuthenticated: computed(() => store.accessToken() !== null && store.currentUser() !== null),
  })),
  withMethods((store, authStore = inject(AuthStore)) => {
    const logoutRequested = new Subject<void>();

    let tokenRenewal: Observable<string> | null = null;

    function clearSession(): void {
      logoutRequested.next();
      patchState(store, initialState);
    }

    return {
      clearSession,
      renewAccessToken(): Observable<string> {
        return defer(() => {
          const previousAccessToken = store.accessToken();

          if (previousAccessToken === null || store.currentUser() === null) {
            throw new Error('No active session');
          }

          if (tokenRenewal !== null) {
            return tokenRenewal;
          }

          const renewal: Observable<string> = authStore.refresh().pipe(
            map((response) => response.accessToken),
            tap((newAccessToken) => {
              if (store.accessToken() !== previousAccessToken) {
                throw new Error('Session changed during token renewal');
              }

              patchState(store, { accessToken: newAccessToken });
            }),
            timeout(10_000),
            takeUntil(logoutRequested),
            finalize(() => {
              if (tokenRenewal === renewal) {
                tokenRenewal = null;
              }
            }),
            shareReplay({ bufferSize: 1, refCount: true }),
          );
          tokenRenewal = renewal;

          return tokenRenewal;
        });
      },
      restore(): Observable<void> {
        return defer(() => {
          if (store.isLoading()) {
            return of(undefined);
          }

          patchState(store, { ...initialState, isLoading: true });

          return authStore.refresh().pipe(
            switchMap((response) => {
              return authStore.getCurrentUser(response.accessToken).pipe(
                tap((currentUser) => {
                  patchState(store, { currentUser, accessToken: response.accessToken });
                }),
              );
            }),
            map(() => undefined),
            timeout(10_000),
            catchError((error: unknown) => {
              patchState(store, {
                ...initialState,
                errorMessage:
                  error instanceof HttpErrorResponse && error.status === 401
                    ? null
                    : 'Impossible de restaurer la session. Veuillez réessayer.',
              });

              return of(undefined);
            }),
            takeUntil(logoutRequested),
            finalize(() => {
              patchState(store, { isLoading: false });
            }),
          );
        });
      },
      logout: rxMethod<void>(
        pipe(
          exhaustMap(() => {
            clearSession();
            patchState(store, { isLoading: true });

            return authStore.logout().pipe(
              timeout(10_000),
              catchError(() => {
                patchState(store, {
                  errorMessage: 'Déconnexion serveur impossible. Veuillez réessayer.',
                });
                return EMPTY;
              }),
              finalize(() => {
                patchState(store, { isLoading: false });
              }),
            );
          }),
        ),
      ),
      login: rxMethod<LoginRequest>(
        pipe(
          exhaustMap((credentials) => {
            if (store.isLoading()) {
              return EMPTY;
            }

            clearSession();
            patchState(store, { isLoading: true });

            return authStore.login(credentials).pipe(
              switchMap((response) => {
                return authStore.getCurrentUser(response.accessToken).pipe(
                  tap((currentUser) => {
                    patchState(store, {
                      currentUser,
                      accessToken: response.accessToken,
                      isLoading: false,
                      errorMessage: null,
                    });
                  }),
                );
              }),
              catchError(() => {
                patchState(store, {
                  ...initialState,
                  errorMessage: 'Connexion impossible. Veuillez réessayer.',
                });
                return EMPTY;
              }),
              takeUntil(logoutRequested),
            );
          }),
        ),
      ),
    };
  }),
);
