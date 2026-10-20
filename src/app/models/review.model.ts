export interface Review {
  id: number;
  authorName: string;
  rating: number;
  comment: string;
  createdAt: string;
  serviceProviderId: number;
}

export interface CreateReview {
  serviceRequestId: number;
  rating: number;
  comment: string;
}
