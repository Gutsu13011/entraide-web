import { ServiceRequestParticipant } from './service-request.model';

export interface ServiceRequestMessage {
  id: number;
  content: string;
  createdAt: string;
  readAt: string | null;
  serviceRequestId: number;
  authorUserId: number;
  author: ServiceRequestParticipant;
}

export interface CreateServiceRequestMessage {
  content: string;
}

export interface MarkServiceRequestMessagesRead {
  upToMessageId: number;
}
