import {
  afterNextRender,
  Component,
  DestroyRef,
  DOCUMENT,
  inject,
  Injector,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { ServiceRequestMessage } from '../../../models/service-request-message.model';
import { ServiceRequestStore } from '../../services/service-request-store';
import { finalize, fromEvent, interval, merge, Subject, takeUntil } from 'rxjs';
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthSession } from '../../../auth/services/auth-session';
import { unreadMessageState } from '../../services/unread-message-store';

@Component({
  imports: [DatePipe, ReactiveFormsModule],
  selector: 'app-service-request-conversation',
  styleUrl: './service-request-conversation.scss',
  templateUrl: './service-request-conversation.html',
})
export class ServiceRequestConversation implements OnInit {
  private readonly serviceRequestStore = inject(ServiceRequestStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly authSession = inject(AuthSession);
  private readonly injector = inject(Injector);
  private readonly unreadMessageState = inject(unreadMessageState);
  private readonly document = inject(DOCUMENT);
  private readonly messageLoadCancelled = new Subject<void>();

  readonly serviceRequestId = input.required<number>();
  readonly messages = signal<ServiceRequestMessage[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly loadError = signal<string | null>(null);
  readonly isSending = signal<boolean>(false);
  readonly sendError = signal<string | null>(null);
  readonly messageForm = new FormGroup({
    content: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(2000)],
    }),
  });
  readonly readError = signal<string | null>(null);
  readonly isRefreshing = signal<boolean>(false);
  readonly refreshError = signal<string | null>(null);

  ngOnInit(): void {
    this.loadMessages(true);

    merge(interval(10_000), fromEvent(this.document, 'visibilitychange'))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (
          this.document.visibilityState === 'visible' &&
          this.authSession.currentUser() !== null &&
          this.loadError() === null
        ) {
          this.loadMessages(false);
        }
      });
  }

  private loadMessages(isInitialLoad: boolean): void {
    if (this.isLoading() || this.isRefreshing() || this.isSending()) {
      return;
    }

    if (isInitialLoad) {
      this.isLoading.set(true);
      this.loadError.set(null);
    } else {
      this.isRefreshing.set(true);
      this.refreshError.set(null);
    }

    this.serviceRequestStore
      .getMessages(this.serviceRequestId())
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        takeUntil(this.messageLoadCancelled),
        finalize(() => {
          this.isLoading.set(false);
          this.isRefreshing.set(false);
        }),
      )
      .subscribe({
        next: (messages) => {
          this.messages.set(messages);

          afterNextRender(
            () => {
              if (
                this.document.visibilityState === 'visible' &&
                !this.isLoading() &&
                this.loadError() === null &&
                !this.isRefreshing() &&
                this.refreshError() === null
              ) {
                this.markReceivedMessagesAsRead(messages);
              }
            },
            { injector: this.injector },
          );
        },
        error: () => {
          if (isInitialLoad) {
            this.loadError.set('Impossible de charger la conversation. Veuillez réessayer.');
          } else {
            this.refreshError.set(
              'Impossible d’actualiser la conversation. Les messages affichés sont conservés.',
            );
          }
        },
      });
  }

  onSendMessage(): void {
    if (this.isSending()) {
      return;
    }

    if (this.messageForm.invalid) {
      this.messageForm.markAllAsTouched();
      return;
    }

    this.messageLoadCancelled.next();

    const message = this.messageForm.getRawValue();

    this.isSending.set(true);
    this.sendError.set(null);
    this.serviceRequestStore
      .sendMessage(this.serviceRequestId(), message)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isSending.set(false)),
      )
      .subscribe({
        next: (savedMessage) => {
          this.messages.update((messages) => [...messages, savedMessage]);
          this.messageForm.reset();
        },
        error: () => {
          this.sendError.set('Impossible d’envoyer votre message. Veuillez réessayer.');
        },
      });
  }

  markReceivedMessagesAsRead(messages: ServiceRequestMessage[]): void {
    const currentUser = this.authSession.currentUser();

    if (currentUser === null) {
      return;
    }

    const hasUnreadReceivedMessages = messages.some(
      (message) => message.authorUserId !== currentUser.id && message.readAt === null,
    );

    if (!hasUnreadReceivedMessages) {
      return;
    }

    const upToMessageId = Math.max(...messages.map((message) => message.id));

    this.readError.set(null);
    this.serviceRequestStore
      .markMessagesAsRead(this.serviceRequestId(), { upToMessageId })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.unreadMessageState.refresh();
        },
        error: () => {
          this.readError.set('Impossible de marquer les messages comme lus');
        },
      });
  }
}
