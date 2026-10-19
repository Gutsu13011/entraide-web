import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ServiceRequestStore } from './service-request-store';
import {
  CreateServiceRequest,
  ServiceRequest,
  ServiceRequestStatus,
  UpdateServiceRequestStatus,
} from '../../models/service-request.model';
import { ServicePricingType } from '../../models/service-offering.model';

describe('ServiceRequestStore', () => {
  let service: ServiceRequestStore;
  let httpTesting: HttpTestingController;
  const creationUrl =
    'http://localhost:3000/service-providers/7/service-offerings/12/service-requests';
  const creationBody: CreateServiceRequest = {
    message: 'Bonjour, je souhaite repeindre ma chambre.',
  };
  const hourlyRequest: ServiceRequest = {
    id: 42,
    message: creationBody.message,
    status: ServiceRequestStatus.SENT,
    createdAt: '2026-10-12T09:30:00.000Z',
    requesterUserId: 8,
    recipientUserId: 9,
    serviceOfferingId: 12,
    offeringTitleSnapshot: 'Peinture',
    offeringPricingTypeSnapshot: ServicePricingType.HOURLY,
    offeringHourlyRateSnapshot: 35,
    requester: { id: 8, firstName: 'Alice', lastName: 'Martin' },
    recipient: { id: 9, firstName: 'Bruno', lastName: 'Leroy' },
  };
  const deletedOfferingRequest: ServiceRequest = {
    ...hourlyRequest,
    id: 43,
    message: 'Bonjour, je souhaite un conseil.',
    serviceOfferingId: null,
    offeringTitleSnapshot: 'Conseil gratuit',
    offeringPricingTypeSnapshot: ServicePricingType.FREE,
    offeringHourlyRateSnapshot: null,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClientTesting()] });
    service = TestBed.inject(ServiceRequestStore);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should post the message to the selected offering and return the created request', () => {
    const nextSpy = vi.fn();
    const completeSpy = vi.fn();
    const errorSpy = vi.fn();

    service.add(7, 12, creationBody).subscribe({
      next: nextSpy,
      complete: completeSpy,
      error: errorSpy,
    });

    const pending = httpTesting.expectOne(creationUrl);
    expect(pending.request.method).toBe('POST');
    expect(pending.request.body).toEqual({ message: creationBody.message });
    expect(nextSpy).not.toHaveBeenCalled();
    expect(completeSpy).not.toHaveBeenCalled();

    pending.flush(hourlyRequest, { status: 201, statusText: 'Created' });

    expect(nextSpy).toHaveBeenCalledExactlyOnceWith(hourlyRequest);
    expect(completeSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it.each([
    { method: 'getSent' as const, path: 'sent' },
    { method: 'getReceived' as const, path: 'received' },
  ])(
    'should fetch $path requests and preserve participants, snapshots and nullable fields',
    ({ method, path }) => {
      const response = [hourlyRequest, deletedOfferingRequest];
      const nextSpy = vi.fn();

      service[method]().subscribe(nextSpy);

      const pending = httpTesting.expectOne(`http://localhost:3000/service-requests/${path}`);
      expect(pending.request.method).toBe('GET');
      expect(pending.request.body).toBeNull();
      expect(pending.request.params.keys()).toEqual([]);
      pending.flush(response);

      expect(nextSpy).toHaveBeenCalledExactlyOnceWith(response);
    },
  );

  it.each([
    { method: 'getSent' as const, path: 'sent' },
    { method: 'getReceived' as const, path: 'received' },
  ])('should return an empty $path list when there are no requests', ({ method, path }) => {
    const nextSpy = vi.fn();

    service[method]().subscribe(nextSpy);

    const pending = httpTesting.expectOne(`http://localhost:3000/service-requests/${path}`);
    pending.flush([]);

    expect(nextSpy).toHaveBeenCalledExactlyOnceWith([]);
  });

  it.each([
    { status: 400, statusText: 'Bad Request', message: 'Invalid message' },
    { status: 401, statusText: 'Unauthorized', message: 'Unauthorized' },
    { status: 409, statusText: 'Conflict', message: 'This service provider profile has no owner' },
  ])(
    'should propagate a creation failure with status $status',
    ({ status, statusText, message }) => {
      const nextSpy = vi.fn();
      const completeSpy = vi.fn();
      const errorSpy = vi.fn();
      const errorBody = { message };

      service.add(7, 12, creationBody).subscribe({
        next: nextSpy,
        complete: completeSpy,
        error: errorSpy,
      });

      const pending = httpTesting.expectOne(creationUrl);
      pending.flush(errorBody, { status, statusText });

      expect(nextSpy).not.toHaveBeenCalled();
      expect(completeSpy).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ status, error: errorBody }),
      );
    },
  );

  it.each([
    { method: 'getSent' as const, path: 'sent' },
    { method: 'getReceived' as const, path: 'received' },
  ])(
    'should propagate an unauthorized $path response instead of an empty list',
    ({ method, path }) => {
      const nextSpy = vi.fn();
      const completeSpy = vi.fn();
      const errorSpy = vi.fn();
      const errorBody = { message: 'Unauthorized' };

      service[method]().subscribe({ next: nextSpy, complete: completeSpy, error: errorSpy });

      const pending = httpTesting.expectOne(`http://localhost:3000/service-requests/${path}`);
      pending.flush(errorBody, { status: 401, statusText: 'Unauthorized' });

      expect(nextSpy).not.toHaveBeenCalled();
      expect(completeSpy).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ status: 401, error: errorBody }),
      );
    },
  );

  describe('updateStatus', () => {
    const updateUrl = 'http://localhost:3000/service-requests/42/status';
    const statuses: UpdateServiceRequestStatus['status'][] = [
      ServiceRequestStatus.READ,
      ServiceRequestStatus.ACCEPTED,
      ServiceRequestStatus.REJECTED,
    ];

    it.each(statuses)(
      'should patch only the requested %s status and return the updated request after the response',
      (status) => {
        const nextSpy = vi.fn();
        const completeSpy = vi.fn();
        const errorSpy = vi.fn();
        const response: ServiceRequest = { ...hourlyRequest, status };

        service.updateStatus(42, { status }).subscribe({
          next: nextSpy,
          complete: completeSpy,
          error: errorSpy,
        });

        const pending = httpTesting.expectOne(updateUrl);
        expect(pending.request.method).toBe('PATCH');
        expect(pending.request.body).toEqual({ status });
        expect(nextSpy).not.toHaveBeenCalled();
        expect(completeSpy).not.toHaveBeenCalled();

        pending.flush(response);

        expect(nextSpy).toHaveBeenCalledExactlyOnceWith(response);
        expect(completeSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy).not.toHaveBeenCalled();
        expect(hourlyRequest.status).toBe(ServiceRequestStatus.SENT);
      },
    );

    it('should return the updated historical request with its deleted offering and free snapshot intact', () => {
      const nextSpy = vi.fn();
      const response: ServiceRequest = {
        ...deletedOfferingRequest,
        status: ServiceRequestStatus.ACCEPTED,
      };

      service.updateStatus(43, { status: ServiceRequestStatus.ACCEPTED }).subscribe(nextSpy);

      const pending = httpTesting.expectOne('http://localhost:3000/service-requests/43/status');
      expect(pending.request.method).toBe('PATCH');
      expect(pending.request.body).toEqual({ status: ServiceRequestStatus.ACCEPTED });
      pending.flush(response);

      expect(nextSpy).toHaveBeenCalledExactlyOnceWith(response);
    });

    it.each([
      { status: 400, statusText: 'Bad Request', message: 'Invalid status' },
      { status: 401, statusText: 'Unauthorized', message: 'Unauthorized' },
      {
        status: 403,
        statusText: 'Forbidden',
        message: 'Only the recipient can update this request',
      },
      { status: 404, statusText: 'Not Found', message: 'Service request not found' },
      {
        status: 409,
        statusText: 'Conflict',
        message: 'Service request changed. Refresh and try again',
      },
    ])(
      'should propagate a status update failure with status $status without emitting success',
      ({ status, statusText, message }) => {
        const nextSpy = vi.fn();
        const completeSpy = vi.fn();
        const errorSpy = vi.fn();
        const errorBody = { message };

        service.updateStatus(42, { status: ServiceRequestStatus.ACCEPTED }).subscribe({
          next: nextSpy,
          complete: completeSpy,
          error: errorSpy,
        });

        const pending = httpTesting.expectOne(updateUrl);
        pending.flush(errorBody, { status, statusText });

        expect(nextSpy).not.toHaveBeenCalled();
        expect(completeSpy).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ status, error: errorBody }),
        );
      },
    );
  });
});
