import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import type { Observable } from 'rxjs';
import type { CreateReview, Review } from '../../models/review.model';
import type { ReviewSummary } from '../../models/review-summary.model';
import { API_ORIGIN } from '../../../api.config';

@Service()
export class ReviewStore {
  private readonly apiUrl = `${API_ORIGIN}/service-providers`;
  private readonly http = inject(HttpClient);

  add(serviceProviderId: number, createReview: CreateReview): Observable<Review> {
    return this.http.post<Review>(`${this.apiUrl}/${serviceProviderId}/reviews`, createReview);
  }

  getAll(serviceProviderId: number): Observable<Review[]> {
    return this.http.get<Review[]>(`${this.apiUrl}/${serviceProviderId}/reviews`);
  }

  getSummary(serviceProviderId: number): Observable<ReviewSummary> {
    return this.http.get<ReviewSummary>(`${this.apiUrl}/${serviceProviderId}/reviews/summary`);
  }
}
