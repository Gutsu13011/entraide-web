import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { Observable } from 'rxjs';
import { CreateServiceOffering, ServiceOffering } from '../../models/service-offering.model';

@Service()
export class ServiceOfferingStore {
  private readonly url = 'http://localhost:3000/service-providers';
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
}
