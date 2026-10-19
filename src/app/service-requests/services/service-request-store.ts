import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import {
  CreateServiceRequest,
  ServiceRequest,
  UpdateServiceRequestStatus,
} from '../../models/service-request.model';
import { Observable } from 'rxjs';

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
}
