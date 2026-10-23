import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { ServiceRequestUnreadMessageCounts } from '../../models/service-request-unread-message-counts.model';
import { inject } from '@angular/core';
import { ServiceRequestStore } from './service-request-store';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { catchError, EMPTY, pipe, Subject, switchMap, takeUntil, tap } from 'rxjs';

type UnreadMessageState = {
  counts: ServiceRequestUnreadMessageCounts | null;
  isLoading: boolean;
  errorMessage: string | null;
};

const initialState: UnreadMessageState = {
  counts: null,
  isLoading: false,
  errorMessage: null,
};

export const unreadMessageState = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withMethods((store, serviceRequestStore = inject(ServiceRequestStore)) => {
    const resetRequested = new Subject<void>();

    return {
      reset(): void {
        resetRequested.next();
        patchState(store, initialState);
      },
      refresh: rxMethod<void>(
        pipe(
          switchMap(() => {
            patchState(store, { isLoading: true, errorMessage: null });

            return serviceRequestStore.getUnreadMessageCounts().pipe(
              tap((counts) => {
                patchState(store, {
                  counts,
                  isLoading: false,
                });
              }),
              catchError(() => {
                patchState(store, {
                  counts: null,
                  isLoading: false,
                  errorMessage: 'Impossible de charger les compteurs de messages.',
                });

                return EMPTY;
              }),
              takeUntil(resetRequested),
            );
          }),
        ),
      ),
    };
  }),
);
