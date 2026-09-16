import { ServiceProvider } from './service-provider.model';

export interface PaginatedServiceProviders {
  data: ServiceProvider[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
