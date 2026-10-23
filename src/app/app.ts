import { Component, DOCUMENT, effect, inject, untracked } from '@angular/core';
import { RouterLink, RouterOutlet, Router, RouterLinkActive } from '@angular/router';
import { AuthSession } from './auth/services/auth-session';
import { unreadMessageState } from './service-requests/services/unread-message-store';
import { fromEvent, interval } from 'rxjs';

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
  }

  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  readonly authSession = inject(AuthSession);
  readonly unreadMessageState = inject(unreadMessageState);

  onLogout(): void {
    this.authSession.logout();
    this.router.navigate(['/login']);
  }
}
