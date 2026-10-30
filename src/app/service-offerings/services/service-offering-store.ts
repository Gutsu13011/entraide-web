import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CreateServiceOffering,
  ServiceOffering,
  UpdateServiceOffering,
} from '../../models/service-offering.model';
import { API_ORIGIN } from '../../../api.config';

@Service()
export class ServiceOfferingStore {
  private readonly url = `${API_ORIGIN}/service-providers`;
  private readonly http = inject(HttpClient);

  getAll(serviceProviderId: number): Observable<ServiceOffering[]> {
    return this.http.get<ServiceOffering[]>(`${this.url}/${serviceProviderId}/service-offerings`);
  }

  add(
    serviceProviderId: number,
    createServiceOffering: CreateServiceOffering,
  ): Observable<ServiceOffering> {
    return this.http.post<ServiceOffering>(
      `${this.url}/${serviceProviderId}/service-offerings`,
      createServiceOffering,
    );
  }

  update(
    serviceProviderId: number,
    id: number,
    changes: UpdateServiceOffering,
  ): Observable<ServiceOffering> {
    return this.http.patch<ServiceOffering>(
      `${this.url}/${serviceProviderId}/service-offerings/${id}`,
      changes,
    );
  }

  delete(serviceProviderId: number, id: number): Observable<void> {
    return this.http.delete<void>(`${this.url}/${serviceProviderId}/service-offerings/${id}`);
  }

  getById(serviceProviderId: number, id: number): Observable<ServiceOffering> {
    return this.http.get<ServiceOffering>(
      `${this.url}/${serviceProviderId}/service-offerings/${id}`,
    );
  }
}
