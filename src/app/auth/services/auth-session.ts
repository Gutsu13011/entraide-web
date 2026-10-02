import { signalStore, withState, withComputed, withMethods, patchState } from '@ngrx/signals';
import { computed, inject } from '@angular/core';
import { pipe, exhaustMap, switchMap, tap, catchError, EMPTY, Subject, takeUntil } from 'rxjs';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { AuthStore } from './auth-store';
import type { CurrentUserResponse, LoginRequest } from '../../models/auth.model';

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

    return {
      logout(): void {
        logoutRequested.next();
        patchState(store, initialState);
      },
      login: rxMethod<LoginRequest>(
        pipe(
          exhaustMap((credentials) => {
            patchState(store, { ...initialState, isLoading: true });

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
