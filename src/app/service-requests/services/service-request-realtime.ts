import { Service } from '@angular/core';
import { Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { API_ORIGIN } from '../../../api.config';

export type ConversationChangedEvent = {
  serviceRequestId: number;
};

@Service()
export class ServiceRequestRealtime {
  private socket: Socket | null = null;

  private readonly conversationChangedSubject = new Subject<ConversationChangedEvent>();
  private readonly connectedSubject = new Subject<void>();
  private readonly renewalRequestedSubject = new Subject<void>();

  readonly conversationChanged$ = this.conversationChangedSubject.asObservable();
  readonly connected$ = this.connectedSubject.asObservable();
  readonly renewalRequested$ = this.renewalRequestedSubject.asObservable();

  connect(accessToken: string): void {
    this.disconnect();

    const socket = io(`${API_ORIGIN}/service-request-messages`, {
      autoConnect: false,
      auth: { accessToken },
    });

    this.socket = socket;
    socket.on('conversation.changed', (event: ConversationChangedEvent) => {
      this.conversationChangedSubject.next(event);
    });
    socket.on('connect', () => {
      this.connectedSubject.next();
    });
    socket.on('disconnect', (reason) => {
      if (reason === 'io server disconnect') {
        this.renewalRequestedSubject.next();
      }
    });
    socket.on('connect_error', (error: Error) => {
      if (!socket.active && error.message === 'Unauthorized') {
        this.renewalRequestedSubject.next();
      }
    });

    socket.connect();
  }

  disconnect(): void {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
  }
}
