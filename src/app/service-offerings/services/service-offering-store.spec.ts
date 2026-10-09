import { TestBed } from '@angular/core/testing';
import { ServiceOfferingStore } from './service-offering-store';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import {
  CreateServiceOffering,
  ServiceOffering,
  ServicePricingType,
  UpdateServiceOffering,
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

  describe('delete', () => {
    it('should delete the selected offering and complete after a no-content response', () => {
      const nextSpy = vi.fn();
      const completeSpy = vi.fn();
      const errorSpy = vi.fn();
      service.delete(7, 12).subscribe({
        next: nextSpy,
        complete: completeSpy,
        error: errorSpy,
      });

      const request = httpTesting.expectOne(
        'http://localhost:3000/service-providers/7/service-offerings/12',
      );
      expect(request.request.method).toBe('DELETE');
      expect(request.request.body).toBeNull();
      expect(nextSpy).not.toHaveBeenCalled();
      expect(completeSpy).not.toHaveBeenCalled();

      request.flush(null, { status: 204, statusText: 'No Content' });

      expect(nextSpy).toHaveBeenCalledTimes(1);
      expect(completeSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it.each([
      { status: 401, statusText: 'Unauthorized' },
      { status: 403, statusText: 'Forbidden' },
      { status: 500, statusText: 'Internal Server Error' },
    ])('should propagate a deletion failure with status $status', ({ status, statusText }) => {
      const nextSpy = vi.fn();
      const completeSpy = vi.fn();
      const errorSpy = vi.fn();
      service.delete(7, 12).subscribe({
        next: nextSpy,
        complete: completeSpy,
        error: errorSpy,
      });

      const request = httpTesting.expectOne(
        'http://localhost:3000/service-providers/7/service-offerings/12',
      );
      const errorBody = { message: 'Deletion failed' };
      request.flush(errorBody, { status, statusText });

      expect(nextSpy).not.toHaveBeenCalled();
      expect(completeSpy).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ status, error: errorBody }),
      );
    });
  });

  describe('update', () => {
    it('should patch a service offering and return the updated offering', () => {
      const changes: UpdateServiceOffering = { title: 'Nouveau titre' };
      const updatedOffering: ServiceOffering = {
        id: 12,
        serviceProviderId: 7,
        title: 'Nouveau titre',
        description: 'Conseils pour entretenir votre installation.',
        pricingType: ServicePricingType.HOURLY,
        hourlyRate: 35,
      };
      let receivedOffering: ServiceOffering | undefined;

      service.update(7, 12, changes).subscribe((response) => (receivedOffering = response));

      const request = httpTesting.expectOne(
        'http://localhost:3000/service-providers/7/service-offerings/12',
      );
      expect(request.request.method).toBe('PATCH');
      expect(request.request.body).toEqual({ title: 'Nouveau titre' });
      request.flush(updatedOffering);
      expect(receivedOffering).toEqual(updatedOffering);
    });

    it('should preserve an explicit null hourly rate in a free offering update', () => {
      const changes: UpdateServiceOffering = {
        pricingType: ServicePricingType.FREE,
        hourlyRate: null,
      };
      const updatedOffering: ServiceOffering = {
        id: 12,
        serviceProviderId: 7,
        title: 'Conseil gratuit',
        description: 'Conseils pour entretenir votre installation.',
        pricingType: ServicePricingType.FREE,
        hourlyRate: null,
      };
      let receivedOffering: ServiceOffering | undefined;

      service.update(7, 12, changes).subscribe((response) => (receivedOffering = response));

      const request = httpTesting.expectOne(
        'http://localhost:3000/service-providers/7/service-offerings/12',
      );
      expect(request.request.method).toBe('PATCH');
      expect(request.request.body).toEqual({
        pricingType: ServicePricingType.FREE,
        hourlyRate: null,
      });
      request.flush(updatedOffering);
      expect(receivedOffering).toEqual(updatedOffering);
    });

    it('should propagate a forbidden update response to the subscriber', () => {
      const nextSpy = vi.fn();
      const errorSpy = vi.fn();
      service.update(7, 12, { title: 'Nouveau titre' }).subscribe({
        next: nextSpy,
        error: errorSpy,
      });

      const request = httpTesting.expectOne(
        'http://localhost:3000/service-providers/7/service-offerings/12',
      );
      const errorBody = { message: 'You do not own this service provider profile' };
      expect(request.request.method).toBe('PATCH');
      request.flush(errorBody, { status: 403, statusText: 'Forbidden' });

      expect(nextSpy).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ status: 403, error: errorBody }),
      );
    });
  });
});
