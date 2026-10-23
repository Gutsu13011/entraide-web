import {
  afterNextRender,
  Component,
  DestroyRef,
  inject,
  Injector,
  input,
  OnInit,
  signal,
} from '@angular/core';
import { ServiceRequestMessage } from '../../../models/service-request-message.model';
import { ServiceRequestStore } from '../../services/service-request-store';
import { finalize } from 'rxjs';
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthSession } from '../../../auth/services/auth-session';

@Component({
  imports: [DatePipe, ReactiveFormsModule],
  selector: 'app-service-request-conversation',
  styleUrl: './service-request-conversation.scss',
  templateUrl: './service-request-conversation.html',
})
export class ServiceRequestConversation implements OnInit {
  constructor(
    private readonly serviceRequestStore: ServiceRequestStore,
    private readonly destroyRef: DestroyRef,
  ) {}
  private readonly authSession = inject(AuthSession);
  private readonly injector = inject(Injector);

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

  ngOnInit(): void {
    this.isLoading.set(true);
    this.loadError.set(null);
    this.serviceRequestStore
      .getMessages(this.serviceRequestId())
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isLoading.set(false)),
      )
      .subscribe({
        next: (messages) => {
          this.messages.set(messages);

          afterNextRender(
            () => {
              if (!this.isLoading() && this.loadError() === null) {
                this.markReceivedMessagesAsRead(messages);
              }
            },
            { injector: this.injector },
          );
        },
        error: () => {
          this.loadError.set('Impossible de charger la conversation. Veuillez réessayer.');
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
        error: () => {
          this.readError.set('Impossible de marquer les messages comme lus');
        },
      });
  }
}
