export interface ServiceProvider {
  id: number;
  firstName: string;
  lastName: string;
  profession: string;
  city: string;
  description: string;
  hourlyRate: number;
  imageUrl: string;
  available: boolean;
  ownerUserId: number | null;
}

export type UpdateServiceProvider = Partial<Omit<ServiceProvider, 'id' | 'ownerUserId'>>;
