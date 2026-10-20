import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ReviewStore } from './review-store';
import type { CreateReview, Review } from '../../models/review.model';
import { HttpErrorResponse } from '@angular/common/http';
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

  describe('add', () => {
    const url = 'http://localhost:3000/service-providers/13/reviews';
    const body: CreateReview = {
      serviceRequestId: 41,
      rating: 5,
      comment: 'Excellent service.',
    };

    it('should post the review to the selected provider and return the public review response', () => {
      const response: Review = {
        id: 8,
        authorName: 'Bruno Leroy',
        rating: 5,
        comment: body.comment,
        createdAt: '2026-10-20T09:00:00.000Z',
        serviceProviderId: 13,
      };
      const nextSpy = vi.fn();
      const completeSpy = vi.fn();
      service.add(13, body).subscribe({ next: nextSpy, complete: completeSpy });

      const pending = httpTesting.expectOne(url);
      expect(pending.request.method).toBe('POST');
      expect(pending.request.body).toEqual({
        serviceRequestId: 41,
        rating: 5,
        comment: body.comment,
      });
      expect(nextSpy).not.toHaveBeenCalled();
      expect(completeSpy).not.toHaveBeenCalled();

      pending.flush(response, { status: 201, statusText: 'Created' });

      expect(nextSpy).toHaveBeenCalledExactlyOnceWith(response);
      expect(completeSpy).toHaveBeenCalledOnce();
    });

    it.each([
      {
        status: 403,
        statusText: 'Forbidden',
        message: 'Only the requester can review this service',
      },
      {
        status: 409,
        statusText: 'Conflict',
        message: 'This service request has already been reviewed',
      },
    ])(
      'should propagate a $status response without emitting a successful review',
      ({ status, statusText, message }) => {
        const nextSpy = vi.fn();
        const completeSpy = vi.fn();
        const errorSpy = vi.fn();
        const errorBody = { statusCode: status, error: statusText, message };
        service.add(13, body).subscribe({ next: nextSpy, complete: completeSpy, error: errorSpy });

        const pending = httpTesting.expectOne(url);
        expect(pending.request.method).toBe('POST');
        pending.flush(errorBody, { status, statusText });

        expect(nextSpy).not.toHaveBeenCalled();
        expect(completeSpy).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledExactlyOnceWith(expect.any(HttpErrorResponse));
        expect(errorSpy.mock.calls[0][0]).toMatchObject({ status, error: errorBody, url });
        httpTesting.expectNone(url);
      },
    );
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
