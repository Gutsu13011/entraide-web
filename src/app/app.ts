import { Component, DOCUMENT, effect, inject, signal, untracked } from '@angular/core';
import {
  RouterLink,
  RouterOutlet,
  Router,
  RouterLinkActive,
  PRIMARY_OUTLET,
} from '@angular/router';
import { AuthSession } from './auth/services/auth-session';
import { unreadMessageState } from './service-requests/services/unread-message-store';
import {
  catchError,
  defer,
  EMPTY,
  exhaustMap,
  fromEvent,
  interval,
  merge,
  Observable,
  tap,
} from 'rxjs';
import { ServiceRequestRealtime } from './service-requests/services/service-request-realtime';
import { CurrentUserResponse } from './models/auth.model';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  constructor() {
    effect(() => {
      if (!this.authSession.reauthenticationRequired()) {
        return;
      }

      untracked(() => {
        const returnUrl = this.router.url;
        const currentPage =
          this.router.parseUrl(returnUrl).root.children[PRIMARY_OUTLET]?.segments[0]?.path;

        if (currentPage === 'login' || currentPage === 'register') {
          return;
        }

        this.router.navigate(['/login'], { queryParams: { returnUrl }, replaceUrl: true });
      });
    });

    effect((onCleanup) => {
      const currentUser = this.authSession.currentUser();

      untracked(() => {
        this.closeAccountMenu();
        this.unreadMessageState.reset();

        if (currentUser === null) {
          return;
        }

        this.unreadMessageState.refresh();

        const refreshIfVisible = () => {
          if (!this.unreadMessageState.isLoading() && this.document.visibilityState === 'visible') {
            this.unreadMessageState.refresh();
          }
        };
        const polling = interval(30_000).subscribe(refreshIfVisible);
        const visibilityChange = fromEvent(this.document, 'visibilitychange').subscribe(
          refreshIfVisible,
        );

        onCleanup(() => {
          polling.unsubscribe();
          visibilityChange.unsubscribe();
        });
      });
    });

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

  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly serviceRequestRealtime = inject(ServiceRequestRealtime);

  private realtimeRenewalUser: CurrentUserResponse | null = null;

  readonly authSession = inject(AuthSession);
  readonly unreadMessageState = inject(unreadMessageState);
  readonly isAccountMenuOpen = signal<boolean>(false);

  toggleAccountMenu(): void {
    this.isAccountMenuOpen.update((isOpen) => !isOpen);
  }

  closeAccountMenu(): void {
    this.isAccountMenuOpen.set(false);
  }

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

  onLogout(): void {
    this.closeAccountMenu();
    this.authSession.logout();
    this.router.navigate(['/login']);
  }
}
