import { TestBed } from '@angular/core/testing';
import { ServiceProviderDetail } from './service-provider-detail';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import { ServiceProviderStore } from '../../services/service-provider-store';
import type { ServiceProvider } from '../../../models/service-provider.model';
import { ReviewStore } from '../../../reviews/services/review-store';
import type { Review } from '../../../models/review.model';
import type { ReviewSummary } from '../../../models/review-summary.model';
import { ServiceOfferingStore } from '../../../service-offerings/services/service-offering-store';
import { ServiceOffering, ServicePricingType } from '../../../models/service-offering.model';

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
  const mockServiceOfferings: ServiceOffering[] = [
    {
      id: 1,
      title: 'title1',
      description: 'description1',
      pricingType: ServicePricingType.FREE,
      hourlyRate: null,
      serviceProviderId: 7,
    },
    {
      id: 2,
      title: 'title2',
      description: 'description2',
      pricingType: ServicePricingType.HOURLY,
      hourlyRate: 20,
      serviceProviderId: 7,
    },
  ];
  const reviewStoreStub = {
    getAll: vi.fn(),
    getSummary: vi.fn(),
  };
  const serviceOfferingsStoreStub = {
    getAll: vi.fn(),
  };

  let component: ServiceProviderDetail;
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    reviewStoreStub.getAll.mockReset().mockReturnValue(of(mockReviews));
    reviewStoreStub.getSummary.mockReset().mockReturnValue(of(mockReviewSummary));
    serviceOfferingsStoreStub.getAll.mockReset().mockReturnValue(of(mockServiceOfferings));

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
        {
          provide: ServiceOfferingStore,
          useValue: serviceOfferingsStoreStub,
        },
      ],
    }).compileComponents();

    harness = await RouterTestingHarness.create();
  });
  const openDetail = async () => {
    component = await harness.navigateByUrl('/service-providers/7', ServiceProviderDetail);
  };

  it('should create', async () => {
    await openDetail();
    expect(component).toBeTruthy();
  });

  it('should load and display reviews with their summary', async () => {
    await openDetail();
    expect(reviewStoreStub.getAll).toHaveBeenCalledWith(7);
    expect(reviewStoreStub.getSummary).toHaveBeenCalledWith(7);

    expect(component.reviews()).toEqual(mockReviews);
    expect(component.reviewSummary()).toEqual(mockReviewSummary);

    const element = harness.routeNativeElement;

    expect(element?.textContent).toContain('Alice Martin');
    expect(element?.textContent).toContain('Excellent service.');
    expect(element?.textContent).toContain('19/09/2026');
  });

  it('should load and display service offerings with data', async () => {
    await openDetail();
    const element = harness.routeNativeElement;

    expect(serviceOfferingsStoreStub.getAll).toHaveBeenCalledWith(7);
    expect(component.isServiceOfferingsLoading()).toBe(false);
    expect(component.serviceOfferings()).toEqual(mockServiceOfferings);
    expect(element?.textContent).toContain('title1');
    expect(element?.textContent).toContain('title2');
    expect(element?.textContent).toContain('Gratuit');
    expect(element?.textContent).toContain('20€/heure');
  });

  it('should load and display service offerings without data', async () => {
    serviceOfferingsStoreStub.getAll.mockReturnValue(of([]));
    await openDetail();
    const element = harness.routeNativeElement;

    expect(serviceOfferingsStoreStub.getAll).toHaveBeenCalledWith(7);
    expect(component.isServiceOfferingsLoading()).toBe(false);
    expect(component.serviceOfferings()).toEqual([]);
    expect(element?.textContent).toContain('Aucune offre de service pour le moment.');
    expect(element?.textContent).not.toContain('title1');
  });

  it('should load and display service offerings error', async () => {
    serviceOfferingsStoreStub.getAll.mockReturnValue(throwError(() => new Error()));
    await openDetail();
    const element = harness.routeNativeElement;

    expect(serviceOfferingsStoreStub.getAll).toHaveBeenCalledWith(7);
    expect(component.isServiceOfferingsLoading()).toBe(false);
    expect(component.serviceOfferings()).toEqual([]);
    expect(element?.textContent).toContain('Impossible de charger les offres.');
    expect(element?.textContent).not.toContain('title1');
    expect(component.reviews()).toEqual(mockReviews);
    expect(component.reviewSummary()).toEqual(mockReviewSummary);
    expect(element?.textContent).toContain('Alice Martin');
    expect(element?.textContent).toContain('Excellent service.');
    expect(element?.textContent).toContain('19/09/2026');
  });
});
