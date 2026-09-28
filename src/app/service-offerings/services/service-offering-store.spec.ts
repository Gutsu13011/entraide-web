import { TestBed } from '@angular/core/testing';
import { ServiceOfferingStore } from './service-offering-store';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  CreateServiceOffering,
  ServiceOffering,
  ServicePricingType,
} from '../../models/service-offering.model';

describe('ServiceOfferingStore', () => {
  let service: ServiceOfferingStore;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClientTesting()] });
    service = TestBed.inject(ServiceOfferingStore);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('getAll(7)', () => {
    const mockServiceOfferingsResponse: ServiceOffering[] = [
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

    let expectedServiceOfferings: ServiceOffering[] | undefined;

    service.getAll(7).subscribe((response) => (expectedServiceOfferings = response));

    const request = httpTesting.expectOne(
      'http://localhost:3000/service-providers/7/service-offerings',
    );
    expect(request.request.method).toBe('GET');
    request.flush(mockServiceOfferingsResponse);
    expect(expectedServiceOfferings).toEqual(mockServiceOfferingsResponse);
  });

  it('should add free service offering', () => {
    const createServiceOfferingMock: CreateServiceOffering = {
      title: 'title',
      description: 'description',
      pricingType: ServicePricingType.FREE,
    };
    const createServiceOfferingResponse: ServiceOffering = {
      id: 1,
      title: 'title',
      description: 'description',
      pricingType: ServicePricingType.FREE,
      hourlyRate: null,
      serviceProviderId: 7,
    };

    let expectedCreateServiceOffering: ServiceOffering | undefined;

    service
      .add(7, createServiceOfferingMock)
      .subscribe((response) => (expectedCreateServiceOffering = response));

    const request = httpTesting.expectOne(
      'http://localhost:3000/service-providers/7/service-offerings',
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(createServiceOfferingMock);
    request.flush(createServiceOfferingResponse);
    expect(expectedCreateServiceOffering).toEqual(createServiceOfferingResponse);
  });
});
