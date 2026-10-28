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
import { fromEvent, interval } from 'rxjs';
import { ServiceRequestRealtime } from './service-requests/services/service-request-realtime';

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
        return;
      }

      untracked(() => {
        const changesSubscription = this.serviceRequestRealtime.conversationChanged$.subscribe(
          () => {
            if (
              this.authSession.currentUser() !== currentUser ||
              this.authSession.accessToken() !== accessToken
            ) {
              return;
            }

            this.unreadMessageState.refresh();
          },
        );
        this.serviceRequestRealtime.connect(accessToken);

        onCleanup(() => {
          changesSubscription.unsubscribe();
          this.serviceRequestRealtime.disconnect();
        });
      });
    });
  }

  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly serviceRequestRealtime = inject(ServiceRequestRealtime);

  readonly authSession = inject(AuthSession);
  readonly unreadMessageState = inject(unreadMessageState);
  readonly isAccountMenuOpen = signal<boolean>(false);

  toggleAccountMenu(): void {
    this.isAccountMenuOpen.update((isOpen) => !isOpen);
  }

  closeAccountMenu(): void {
    this.isAccountMenuOpen.set(false);
  }

  onLogout(): void {
    this.closeAccountMenu();
    this.authSession.logout();
    this.router.navigate(['/login']);
  }
}
