export enum ServicePricingType {
  FREE = 'FREE',
  HOURLY = 'HOURLY',
}
export interface ServiceOffering {
  id: number;
  title: string;
  description: string;
  pricingType: ServicePricingType;
  hourlyRate: number | null;
  serviceProviderId: number;
}
