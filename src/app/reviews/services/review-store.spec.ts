import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ReviewStore } from './review-store';
import type { Review } from '../../models/review.model';
import type { ReviewSummary } from '../../models/review-summary.model';

describe('ReviewStore', () => {
  let service: ReviewStore;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClientTesting()] });
    service = TestBed.inject(ReviewStore);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should fetch reviews for a service provider', () => {
    const mockReviewResponse: Review[] = [
      {
        id: 1,
        authorName: 'Alice Martin',
        rating: 5,
        comment: 'Excellent service.',
        createdAt: '2026-09-19T10:00:00.000Z',
        serviceProviderId: 42,
      },
    ];

    let receivedReview: Review[] | undefined;
    service.getAll(42).subscribe((response) => (receivedReview = response));

    const request = httpTesting.expectOne('http://localhost:3000/service-providers/42/reviews');
    expect(request.request.method).toBe('GET');
    request.flush(mockReviewResponse);
    expect(receivedReview).toEqual(mockReviewResponse);
  });

  it('should fetch the review summary for a service provider', () => {
    const mockSummaryResponse: ReviewSummary = {
      reviewCount: 2,
      averageRating: 4.5,
    };

    let receivedReviewSummary: ReviewSummary | undefined;
    service.getSummary(42).subscribe((response) => (receivedReviewSummary = response));

    const request = httpTesting.expectOne(
      'http://localhost:3000/service-providers/42/reviews/summary',
    );
    expect(request.request.method).toBe('GET');
    request.flush(mockSummaryResponse);
    expect(receivedReviewSummary).toEqual(mockSummaryResponse);
  });
});
