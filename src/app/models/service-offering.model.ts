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

export type CreateServiceOffering =
  | { title: string; description: string; pricingType: ServicePricingType.FREE; hourlyRate?: never }
  | {
      title: string;
      description: string;
      hourlyRate: number;
      pricingType: ServicePricingType.HOURLY;
    };

export type UpdateServiceOffering = Partial<Omit<ServiceOffering, 'id' | 'serviceProviderId'>>;
