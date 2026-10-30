import { DOCUMENT, effect, inject, Service, untracked } from '@angular/core';
import { fromEvent, interval } from 'rxjs';
import { AuthSession } from '../../auth/services/auth-session';
import { MESSAGE_SYNC_FALLBACK_INTERVAL_MS } from '../message-sync.config';
import { unreadMessageState } from './unread-message-store';

@Service({ autoProvided: false })
export class UnreadMessageSync {
  private readonly authSession = inject(AuthSession);
  private readonly unreadMessageState = inject(unreadMessageState);
  private readonly document = inject(DOCUMENT);

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

        const polling = interval(MESSAGE_SYNC_FALLBACK_INTERVAL_MS).subscribe(refreshIfVisible);

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
}
