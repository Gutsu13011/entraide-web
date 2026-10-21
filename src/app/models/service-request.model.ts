import { ServicePricingType } from './service-offering.model';

export interface ServiceRequest {
  id: number;
  message: string;
  status: ServiceRequestStatus;
  hasReview: boolean;
  createdAt: string;
  requesterUserId: number;
  recipientUserId: number;
  serviceOfferingId: number | null;
  serviceProviderId: number | null;
  offeringTitleSnapshot: string;
  offeringPricingTypeSnapshot: ServicePricingType;
  offeringHourlyRateSnapshot: number | null;
  requester: ServiceRequestParticipant;
  recipient: ServiceRequestParticipant;
}

export interface CreateServiceRequest {
  message: string;
}

export interface ServiceRequestParticipant {
  id: number;
  firstName: string;
  lastName: string;
}

export enum ServiceRequestStatus {
  SENT = 'SENT',
  READ = 'READ',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  COMPLETED = 'COMPLETED',
}

export interface UpdateServiceRequestStatus {
  status: Exclude<ServiceRequestStatus, ServiceRequestStatus.SENT>;
}
