import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import {
  CreateServiceRequest,
  ServiceRequest,
  UpdateServiceRequestStatus,
} from '../../models/service-request.model';
import { Observable } from 'rxjs';
import {
  CreateServiceRequestMessage,
  MarkServiceRequestMessagesRead,
  ServiceRequestMessage,
} from '../../models/service-request-message.model';
import { ServiceRequestUnreadMessageCounts } from '../../models/service-request-unread-message-counts.model';
import { API_ORIGIN } from '../../../api.config';

@Service()
export class ServiceRequestStore {
  private readonly http = inject(HttpClient);
  private readonly url = `${API_ORIGIN}/service-requests`;

  add(
    serviceProviderId: number,
    serviceOfferingId: number,
    createServiceRequest: CreateServiceRequest,
  ): Observable<ServiceRequest> {
    return this.http.post<ServiceRequest>(
      `${API_ORIGIN}/service-providers/${serviceProviderId}/service-offerings/${serviceOfferingId}/service-requests`,
      createServiceRequest,
    );
  }

  getSent(): Observable<ServiceRequest[]> {
    return this.http.get<ServiceRequest[]>(`${this.url}/sent`);
  }

  getReceived(): Observable<ServiceRequest[]> {
    return this.http.get<ServiceRequest[]>(`${this.url}/received`);
  }

  updateStatus(
    id: number,
    updateServiceRequestStatus: UpdateServiceRequestStatus,
  ): Observable<ServiceRequest> {
    return this.http.patch<ServiceRequest>(`${this.url}/${id}/status`, updateServiceRequestStatus);
  }

  getMessages(serviceRequestId: number): Observable<ServiceRequestMessage[]> {
    return this.http.get<ServiceRequestMessage[]>(`${this.url}/${serviceRequestId}/messages`);
  }

  sendMessage(
    serviceRequestId: number,
    message: CreateServiceRequestMessage,
  ): Observable<ServiceRequestMessage> {
    return this.http.post<ServiceRequestMessage>(
      `${this.url}/${serviceRequestId}/messages`,
      message,
    );
  }

  markMessagesAsRead(
    serviceRequestId: number,
    boundary: MarkServiceRequestMessagesRead,
  ): Observable<void> {
    return this.http.patch<void>(`${this.url}/${serviceRequestId}/messages/read`, boundary);
  }

  getUnreadMessageCounts(): Observable<ServiceRequestUnreadMessageCounts> {
    return this.http.get<ServiceRequestUnreadMessageCounts>(`${this.url}/messages/unread-counts`);
  }
}
