import { Service, inject } from '@angular/core';
import { ServiceProvider } from '../../models/service-provider.model';
import { PaginatedServiceProviders } from '../../models/paginated-service-providers.model';
import { ServiceProviderQuery } from '../../models/service-provider-query.model';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Service()
export class ServiceProviderStore {
  private readonly apiUrl = 'http://localhost:3000/service-providers';
  private readonly http = inject(HttpClient);

  getAll(query: ServiceProviderQuery = {}): Observable<PaginatedServiceProviders> {
    const search = query.search?.trim();
    const city = query.city?.trim();

    return this.http.get<PaginatedServiceProviders>(this.apiUrl, {
      params: {
        page: query.page ?? 1,
        ...(search ? { search } : {}),
        ...(city ? { city } : {}),
        ...(query.available === undefined ? {} : { available: query.available }),
        ...(query.sortBy ? { sortBy: query.sortBy } : {}),
        ...(query.sortOrder ? { sortOrder: query.sortOrder } : {}),
      },
    });
  }

  getById(id: number): Observable<ServiceProvider> {
    return this.http.get<ServiceProvider>(`${this.apiUrl}/${id}`);
  }

  add(serviceProvider: Omit<ServiceProvider, 'id'>): Observable<ServiceProvider> {
    return this.http.post<ServiceProvider>(this.apiUrl, serviceProvider);
  }
}
