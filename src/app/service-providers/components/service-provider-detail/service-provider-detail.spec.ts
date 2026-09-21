import { TestBed } from '@angular/core/testing';
import { ServiceProviderDetail } from './service-provider-detail';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { ServiceProviderStore } from '../../services/service-provider-store';
import type { ServiceProvider } from '../../../models/service-provider.model';
import { ReviewStore } from '../../../reviews/services/review-store';
import type { Review } from '../../../models/review.model';
import type { ReviewSummary } from '../../../models/review-summary.model';

describe('ServiceProviderDetail', () => {
  const mockServiceProvider: ServiceProvider = {
    id: 7,
    firstName: 'John',
    lastName: 'Doe',
    profession: 'Plombier',
    city: 'Paris',
    description: "Plombier expérimenté avec 5 ans d'expérience.",
    hourlyRate: 25,
    imageUrl: '',
    available: true,
  };
  const serviceProvidersStoreStub = {
    getById: () => of(mockServiceProvider),
  };
  const mockReviews: Review[] = [
    {
      id: 1,
      authorName: 'Alice Martin',
      rating: 5,
      comment: 'Excellent service.',
      createdAt: '2026-09-19T10:00:00.000Z',
      serviceProviderId: 7,
    },
  ];

  const mockReviewSummary: ReviewSummary = {
    reviewCount: 1,
    averageRating: 5,
  };

  const reviewStoreStub = {
    getAll: vi.fn(),
    getSummary: vi.fn(),
  };

  let component: ServiceProviderDetail;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    reviewStoreStub.getAll.mockReset().mockReturnValue(of(mockReviews));
    reviewStoreStub.getSummary.mockReset().mockReturnValue(of(mockReviewSummary));

    await TestBed.configureTestingModule({
      imports: [ServiceProviderDetail],
      providers: [
        provideRouter([
          {
            path: 'service-providers/:id',
            component: ServiceProviderDetail,
          },
        ]),
        {
          provide: ServiceProviderStore,
          useValue: serviceProvidersStoreStub,
        },
        {
          provide: ReviewStore,
          useValue: reviewStoreStub,
        },
      ],
    }).compileComponents();

    harness = await RouterTestingHarness.create();
    component = await harness.navigateByUrl('/service-providers/7', ServiceProviderDetail);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load and display reviews with their summary', () => {
    expect(reviewStoreStub.getAll).toHaveBeenCalledWith(7);
    expect(reviewStoreStub.getSummary).toHaveBeenCalledWith(7);

    expect(component.reviews()).toEqual(mockReviews);
    expect(component.reviewSummary()).toEqual(mockReviewSummary);
    expect(component.isReviewLoading()).toBe(false);

    const element = harness.routeNativeElement;

    expect(element?.textContent).toContain('Alice Martin');
    expect(element?.textContent).toContain('Excellent service.');
    expect(element?.textContent).toContain('19/09/2026');
  });
});
