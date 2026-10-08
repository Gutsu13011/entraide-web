import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ServiceProviderStore } from './service-provider-store';
import { ServiceProvider } from '../../models/service-provider.model';
import { PaginatedServiceProviders } from '../../models/paginated-service-providers.model';

describe('ServiceProviderStore', () => {
  const mockServiceProviders: ServiceProvider[] = [
    {
      id: 0,
      firstName: 'John',
      lastName: 'Doe',
      profession: 'Plombier',
      city: 'Paris',
      description: "Plombier expérimenté avec 5 ans d'expérience.",
      hourlyRate: 25,
      imageUrl: '',
      available: true,
      ownerUserId: null,
    },
    {
      id: 1,
      firstName: 'Kévin',
      lastName: 'Gutsu',
      profession: 'Informaticien',
      city: 'Marseille',
      description: "Informaticien expérimenté avec 20 ans d'expérience.",
      hourlyRate: 70,
      imageUrl: '',
      available: false,
      ownerUserId: null,
    },
  ];
  const mockResponse: PaginatedServiceProviders = {
    data: mockServiceProviders,
    total: 2,
    page: 1,
    limit: 10,
    totalPages: 1,
  };
  let service: ServiceProviderStore;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClientTesting()] });
    service = TestBed.inject(ServiceProviderStore);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should fetch the first page by default', () => {
    let receivedServiceProviders: PaginatedServiceProviders | undefined;
    service.getAll().subscribe((response) => (receivedServiceProviders = response));

    const request = httpTesting.expectOne('http://localhost:3000/service-providers?page=1');
    expect(request.request.method).toBe('GET');
    request.flush(mockResponse);
    expect(receivedServiceProviders).toEqual(mockResponse);
  });

  it('should fetch the requested page', () => {
    const mockPageResponse: PaginatedServiceProviders = {
      data: mockServiceProviders,
      total: 12,
      page: 2,
      limit: 10,
      totalPages: 2,
    };

    let receivedServiceProviders: PaginatedServiceProviders | undefined;
    service.getAll({ page: 2 }).subscribe((response) => (receivedServiceProviders = response));

    const request = httpTesting.expectOne('http://localhost:3000/service-providers?page=2');
    expect(request.request.method).toBe('GET');
    request.flush(mockPageResponse);
    expect(receivedServiceProviders).toEqual(mockPageResponse);
  });

  it('should trim and send the search query', () => {
    const mockPageResponse: PaginatedServiceProviders = {
      data: mockServiceProviders,
      total: 2,
      page: 1,
      limit: 10,
      totalPages: 1,
    };

    let receivedServiceProviders: PaginatedServiceProviders | undefined;
    service
      .getAll({ search: ' plombier ' })
      .subscribe((response) => (receivedServiceProviders = response));

    const request = httpTesting.expectOne(
      'http://localhost:3000/service-providers?page=1&search=plombier',
    );
    expect(request.request.method).toBe('GET');
    request.flush(mockPageResponse);
    expect(receivedServiceProviders).toEqual(mockPageResponse);
  });

  it('should omit a blank search query', () => {
    service.getAll({ search: '   ' }).subscribe();

    const request = httpTesting.expectOne('http://localhost:3000/service-providers?page=1');

    expect(request.request.method).toBe('GET');
    request.flush(mockResponse);
  });

  it('should send filters and sorting options', () => {
    service
      .getAll({
        page: 2,
        search: ' peintre ',
        city: ' Lyon ',
        available: false,
        sortBy: 'hourlyRate',
        sortOrder: 'DESC',
      })
      .subscribe();

    const request = httpTesting.expectOne(
      'http://localhost:3000/service-providers?page=2&search=peintre&city=Lyon&available=false&sortBy=hourlyRate&sortOrder=DESC',
    );

    expect(request.request.method).toBe('GET');
    request.flush(mockResponse);
  });

  it('should delete the requested provider and accept a 204 response', () => {
    const nextSpy = vi.fn();
    const completeSpy = vi.fn();
    const errorSpy = vi.fn();
    service.remove(7).subscribe({ next: nextSpy, complete: completeSpy, error: errorSpy });

    const request = httpTesting.expectOne('http://localhost:3000/service-providers/7');
    expect(request.request.method).toBe('DELETE');
    expect(request.request.body).toBeNull();
    request.flush(null, { status: 204, statusText: 'No Content' });

    expect(nextSpy).toHaveBeenCalledTimes(1);
    expect(completeSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('should propagate a forbidden deletion response to the subscriber', () => {
    const nextSpy = vi.fn();
    const errorSpy = vi.fn();
    service.remove(7).subscribe({ next: nextSpy, error: errorSpy });

    const request = httpTesting.expectOne('http://localhost:3000/service-providers/7');
    request.flush({ message: 'Forbidden' }, { status: 403, statusText: 'Forbidden' });

    expect(nextSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0].status).toBe(403);
  });
});
