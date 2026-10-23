import { Component, effect, inject, untracked } from '@angular/core';
import { RouterLink, RouterOutlet, Router, RouterLinkActive } from '@angular/router';
import { AuthSession } from './auth/services/auth-session';
import { unreadMessageState } from './service-requests/services/unread-message-store';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  constructor() {
    effect(() => {
      const currentUser = this.authSession.currentUser();

      untracked(() => {
        this.unreadMessageState.reset();

        if (currentUser !== null) {
          this.unreadMessageState.refresh();
        }
      });
    });
  }

  private readonly router = inject(Router);

  readonly authSession = inject(AuthSession);
  readonly unreadMessageState = inject(unreadMessageState);

  onLogout(): void {
    this.authSession.logout();
    this.router.navigate(['/login']);
  }
}
