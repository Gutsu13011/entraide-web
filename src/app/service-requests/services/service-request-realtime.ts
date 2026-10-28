import { Service } from '@angular/core';
import { Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';

export type ConversationChangedEvent = {
  serviceRequestId: number;
};

@Service()
export class ServiceRequestRealtime {
  private socket: Socket | null = null;

  private readonly conversationChangedSubject = new Subject<ConversationChangedEvent>();

  readonly conversationChanged$ = this.conversationChangedSubject.asObservable();

  connect(accessToken: string): void {
    this.disconnect();

    const socket = io('http://localhost:3000/service-request-messages', {
      autoConnect: false,
      auth: { accessToken },
    });

    this.socket = socket;
    socket.on('conversation.changed', (event: ConversationChangedEvent) => {
      this.conversationChangedSubject.next(event);
    });

    socket.connect();
  }

  disconnect(): void {
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
  }
}
