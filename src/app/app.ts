import { Component, effect, inject, signal, untracked } from '@angular/core';
import {
  RouterLink,
  RouterOutlet,
  Router,
  RouterLinkActive,
  PRIMARY_OUTLET,
} from '@angular/router';
import { AuthSession } from './auth/services/auth-session';
import { unreadMessageState } from './service-requests/services/unread-message-store';
import { ServiceRequestRealtimeSession } from './service-requests/services/service-request-realtime-session';
import { UnreadMessageSync } from './service-requests/services/unread-message-sync';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  providers: [ServiceRequestRealtimeSession, UnreadMessageSync],
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

    effect(() => {
      this.authSession.currentUser();

      untracked(() => {
        this.closeAccountMenu();
      });
    });

    inject(UnreadMessageSync);
    inject(ServiceRequestRealtimeSession);
  }
  private readonly router = inject(Router);

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
