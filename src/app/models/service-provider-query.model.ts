export type ServiceProviderSortBy = 'id' | 'hourlyRate';
export type ServiceProviderSortOrder = 'ASC' | 'DESC';
export interface ServiceProviderQuery {
  page?: number;
  search?: string;
  city?: string;
  available?: boolean;
  sortBy?: ServiceProviderSortBy;
  sortOrder?: ServiceProviderSortOrder;
}
