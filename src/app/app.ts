import { Component, effect, inject, untracked } from '@angular/core';
import { RouterLink, RouterOutlet, Router, RouterLinkActive } from '@angular/router';
import { AuthSession } from './auth/services/auth-session';
import { unreadMessageState } from './service-requests/services/unread-message-store';
import { interval } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  constructor() {
    effect((onCleanup) => {
      const currentUser = this.authSession.currentUser();

      untracked(() => {
        this.unreadMessageState.reset();

        if (currentUser === null) {
          return;
        }

        this.unreadMessageState.refresh();

        const polling = interval(30_000).subscribe(() => {
          if (!this.unreadMessageState.isLoading()) {
            this.unreadMessageState.refresh();
          }
        });

        onCleanup(() => {
          polling.unsubscribe();
        });
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
