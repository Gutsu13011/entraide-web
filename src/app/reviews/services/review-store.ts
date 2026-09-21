import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import type { Observable } from 'rxjs';
import type { Review } from '../../models/review.model';
import type { ReviewSummary } from '../../models/review-summary.model';

@Service()
export class ReviewStore {
  private readonly apiUrl = 'http://localhost:3000/service-providers';
  private readonly http = inject(HttpClient);

  getAll(serviceProviderId: number): Observable<Review[]> {
    return this.http.get<Review[]>(`${this.apiUrl}/${serviceProviderId}/reviews`);
  }

  getSummary(serviceProviderId: number): Observable<ReviewSummary> {
    return this.http.get<ReviewSummary>(`${this.apiUrl}/${serviceProviderId}/reviews/summary`);
  }
}
