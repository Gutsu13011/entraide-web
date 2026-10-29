import { effect, inject, Service, untracked } from '@angular/core';
import { catchError, defer, EMPTY, exhaustMap, merge, Observable, tap } from 'rxjs';
import { AuthSession } from '../../auth/services/auth-session';
import { ServiceRequestRealtime } from './service-request-realtime';
import { unreadMessageState } from './unread-message-store';
import { CurrentUserResponse } from '../../models/auth.model';

@Service({ autoProvided: false })
export class ServiceRequestRealtimeSession {
  constructor() {
    effect((onCleanup) => {
      const accessToken = this.authSession.accessToken();
      const currentUser = this.authSession.currentUser();

      if (accessToken === null || currentUser === null) {
        this.realtimeRenewalUser = null;
        return;
      }

      untracked(() => {
        const isCurrentSession = () =>
          this.authSession.currentUser() === currentUser &&
          this.authSession.accessToken() === accessToken;
        const changesSubscription = merge(
          this.serviceRequestRealtime.conversationChanged$,
          this.serviceRequestRealtime.connected$.pipe(
            tap(() => {
              if (isCurrentSession()) {
                this.realtimeRenewalUser = null;
              }
            }),
          ),
        ).subscribe(() => {
          if (isCurrentSession()) {
            this.unreadMessageState.refresh();
          }
        });

        const renewalSubscription = this.serviceRequestRealtime.renewalRequested$
          .pipe(exhaustMap(() => this.renewRealtimeSession(accessToken, currentUser)))
          .subscribe((renewedToken) => {
            if (renewedToken === accessToken && isCurrentSession()) {
              this.serviceRequestRealtime.connect(renewedToken);
            }
          });

        this.serviceRequestRealtime.connect(accessToken);

        onCleanup(() => {
          changesSubscription.unsubscribe();
          renewalSubscription.unsubscribe();
          this.serviceRequestRealtime.disconnect();
        });
      });
    });
  }
  private readonly authSession = inject(AuthSession);
  private readonly serviceRequestRealtime = inject(ServiceRequestRealtime);
  private readonly unreadMessageState = inject(unreadMessageState);

  private realtimeRenewalUser: CurrentUserResponse | null = null;

  private renewRealtimeSession(
    accessToken: string,
    currentUser: CurrentUserResponse,
  ): Observable<string> {
    return defer(() => {
      const isCurrentSession = () =>
        this.authSession.currentUser() === currentUser &&
        this.authSession.accessToken() === accessToken;

      if (!isCurrentSession()) {
        return EMPTY;
      }

      if (this.realtimeRenewalUser === currentUser) {
        this.authSession.requiredReauthentication();
        return EMPTY;
      }

      this.realtimeRenewalUser = currentUser;

      return this.authSession.renewAccessToken().pipe(
        catchError(() => {
          if (isCurrentSession()) {
            this.authSession.requiredReauthentication();
          }

          return EMPTY;
        }),
      );
    });
  }
}
