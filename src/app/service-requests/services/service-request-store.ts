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

@Service()
export class ServiceRequestStore {
  private readonly http = inject(HttpClient);
  private readonly url = 'http://localhost:3000';

  add(
    serviceProviderId: number,
    serviceOfferingId: number,
    createServiceRequest: CreateServiceRequest,
  ): Observable<ServiceRequest> {
    return this.http.post<ServiceRequest>(
      `${this.url}/service-providers/${serviceProviderId}/service-offerings/${serviceOfferingId}/service-requests`,
      createServiceRequest,
    );
  }

  getSent(): Observable<ServiceRequest[]> {
    return this.http.get<ServiceRequest[]>(`${this.url}/service-requests/sent`);
  }

  getReceived(): Observable<ServiceRequest[]> {
    return this.http.get<ServiceRequest[]>(`${this.url}/service-requests/received`);
  }

  updateStatus(
    id: number,
    updateServiceRequestStatus: UpdateServiceRequestStatus,
  ): Observable<ServiceRequest> {
    return this.http.patch<ServiceRequest>(
      `${this.url}/service-requests/${id}/status`,
      updateServiceRequestStatus,
    );
  }

  getMessages(serviceRequestId: number): Observable<ServiceRequestMessage[]> {
    return this.http.get<ServiceRequestMessage[]>(
      `${this.url}/service-requests/${serviceRequestId}/messages`,
    );
  }

  sendMessage(
    serviceRequestId: number,
    message: CreateServiceRequestMessage,
  ): Observable<ServiceRequestMessage> {
    return this.http.post<ServiceRequestMessage>(
      `${this.url}/service-requests/${serviceRequestId}/messages`,
      message,
    );
  }

  markMessagesAsRead(
    serviceRequestId: number,
    boundary: MarkServiceRequestMessagesRead,
  ): Observable<void> {
    return this.http.patch<void>(
      `${this.url}/service-requests/${serviceRequestId}/messages/read`,
      boundary,
    );
  }

  getUnreadMessageCounts(): Observable<ServiceRequestUnreadMessageCounts> {
    return this.http.get<ServiceRequestUnreadMessageCounts>(
      `${this.url}/service-requests/messages/unread-counts`,
    );
  }
}
