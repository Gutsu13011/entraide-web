import { TestBed } from '@angular/core/testing';
import type { Observable } from 'rxjs';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ServiceRequestStore } from './service-request-store';
import {
  CreateServiceRequest,
  ServiceRequest,
  ServiceRequestStatus,
  UpdateServiceRequestStatus,
} from '../../models/service-request.model';
import { ServicePricingType } from '../../models/service-offering.model';
import { ServiceRequestMessage } from '../../models/service-request-message.model';
import type { ServiceRequestUnreadMessageCounts } from '../../models/service-request-unread-message-counts.model';

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
    hasReview: false,
    createdAt: '2026-10-12T09:30:00.000Z',
    requesterUserId: 8,
    recipientUserId: 9,
    serviceOfferingId: 12,
    serviceProviderId: 7,
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

  const deletedProviderRequest: ServiceRequest = {
    ...deletedOfferingRequest,
    id: 44,
    serviceProviderId: null,
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
    'should fetch $path requests and preserve review indicators, participants, snapshots and nullable fields',
    ({ method, path }) => {
      const reviewedRequest: ServiceRequest = {
        ...hourlyRequest,
        id: 45,
        status: ServiceRequestStatus.COMPLETED,
        hasReview: true,
      };
      const response = [
        hourlyRequest,
        reviewedRequest,
        deletedOfferingRequest,
        deletedProviderRequest,
      ];
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
      ServiceRequestStatus.COMPLETED,
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

  describe('conversation messages', () => {
    const messagesUrl = 'http://localhost:3000/service-requests/42/messages';
    const message: ServiceRequestMessage = {
      id: 101,
      content: 'Bonjour, serais-tu disponible samedi matin ?',
      createdAt: '2026-10-22T09:30:00.000Z',
      readAt: null,
      serviceRequestId: 42,
      authorUserId: 8,
      author: { id: 8, firstName: 'Alice', lastName: 'Martin' },
    };

    it('should fetch conversation messages and preserve authors, date strings and read receipts', () => {
      const response: ServiceRequestMessage[] = [
        message,
        {
          ...message,
          id: 102,
          content: 'Oui, à partir de 10 heures.',
          createdAt: '2026-10-22T09:35:00.000Z',
          readAt: '2026-10-22T09:36:00.000Z',
          authorUserId: 9,
          author: { id: 9, firstName: 'Bruno', lastName: 'Leroy' },
        },
      ];
      const nextSpy = vi.fn();

      service.getMessages(42).subscribe(nextSpy);

      const pending = httpTesting.expectOne(messagesUrl);
      expect(pending.request.method).toBe('GET');
      expect(pending.request.body).toBeNull();
      expect(pending.request.params.keys()).toEqual([]);
      expect(nextSpy).not.toHaveBeenCalled();
      pending.flush(response);

      expect(nextSpy).toHaveBeenCalledExactlyOnceWith(response);
    });

    it('should return an empty array when the conversation has no replies', () => {
      const nextSpy = vi.fn();

      service.getMessages(42).subscribe(nextSpy);
      httpTesting.expectOne(messagesUrl).flush([]);

      expect(nextSpy).toHaveBeenCalledExactlyOnceWith([]);
    });

    it('should post only the message content and return the saved message after the response', () => {
      const nextSpy = vi.fn();
      const completeSpy = vi.fn();
      const errorSpy = vi.fn();
      const content = 'Bonjour, samedi à 10 heures ?\nMerci !';
      const response = { ...message, content };

      service.sendMessage(42, { content }).subscribe({
        next: nextSpy,
        complete: completeSpy,
        error: errorSpy,
      });

      const pending = httpTesting.expectOne(messagesUrl);
      expect(pending.request.method).toBe('POST');
      expect(pending.request.body).toEqual({ content });
      expect(nextSpy).not.toHaveBeenCalled();
      expect(completeSpy).not.toHaveBeenCalled();
      pending.flush(response, { status: 201, statusText: 'Created' });

      expect(nextSpy).toHaveBeenCalledExactlyOnceWith(response);
      expect(completeSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('should patch only the displayed message boundary and complete after a 204 response', () => {
      const nextSpy = vi.fn();
      const completeSpy = vi.fn();
      const errorSpy = vi.fn();

      service.markMessagesAsRead(42, { upToMessageId: 102 }).subscribe({
        next: nextSpy,
        complete: completeSpy,
        error: errorSpy,
      });

      const pending = httpTesting.expectOne(`${messagesUrl}/read`);
      expect(pending.request.method).toBe('PATCH');
      expect(pending.request.body).toEqual({ upToMessageId: 102 });
      expect(nextSpy).not.toHaveBeenCalled();
      expect(completeSpy).not.toHaveBeenCalled();
      pending.flush(null, { status: 204, statusText: 'No Content' });

      expect(nextSpy).toHaveBeenCalledTimes(1);
      expect(completeSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    const operations: {
      method: string;
      path: string;
      call: () => Observable<unknown>;
    }[] = [
      { method: 'GET', path: messagesUrl, call: () => service.getMessages(42) },
      {
        method: 'POST',
        path: messagesUrl,
        call: () => service.sendMessage(42, { content: message.content }),
      },
      {
        method: 'PATCH',
        path: `${messagesUrl}/read`,
        call: () => service.markMessagesAsRead(42, { upToMessageId: 102 }),
      },
    ];
    const accessFailures = [
      { status: 401, statusText: 'Unauthorized', message: 'Unauthorized' },
      {
        status: 403,
        statusText: 'Forbidden',
        message: 'Only request participants can access this conversation',
      },
      { status: 404, statusText: 'Not Found', message: 'Service request not found' },
    ];
    const failureCases = [
      ...operations.flatMap((operation) =>
        accessFailures.map((failure) => ({ ...operation, ...failure })),
      ),
      {
        ...operations[0],
        status: 500,
        statusText: 'Internal Server Error',
        message: 'Internal server error',
      },
      {
        ...operations[1],
        status: 400,
        statusText: 'Bad Request',
        message: 'Invalid message content',
      },
      {
        ...operations[2],
        status: 400,
        statusText: 'Bad Request',
        message: 'Invalid message boundary',
      },
    ];

    it.each(failureCases)(
      'should propagate a $method conversation failure with status $status without emitting success',
      ({ method, path, call, status, statusText, message: errorMessage }) => {
        const nextSpy = vi.fn();
        const completeSpy = vi.fn();
        const errorSpy = vi.fn();
        const errorBody = { message: errorMessage };

        call().subscribe({ next: nextSpy, complete: completeSpy, error: errorSpy });

        const pending = httpTesting.expectOne(path);
        expect(pending.request.method).toBe(method);
        pending.flush(errorBody, { status, statusText });

        expect(nextSpy).not.toHaveBeenCalled();
        expect(completeSpy).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ status, error: errorBody }),
        );
      },
    );
  });

  describe('getUnreadMessageCounts', () => {
    const url = 'http://localhost:3000/service-requests/messages/unread-counts';

    it.each<ServiceRequestUnreadMessageCounts>([
      { sentRequests: 4, receivedRequests: 5, total: 9 },
      { sentRequests: 0, receivedRequests: 0, total: 0 },
    ])(
      'should fetch the authenticated message counts and return $total unread replies after the response',
      (counts) => {
        const nextSpy = vi.fn();
        const completeSpy = vi.fn();
        const errorSpy = vi.fn();

        service
          .getUnreadMessageCounts()
          .subscribe({ next: nextSpy, complete: completeSpy, error: errorSpy });

        const pending = httpTesting.expectOne(url);
        expect(pending.request.method).toBe('GET');
        expect(pending.request.body).toBeNull();
        expect(pending.request.params.keys()).toEqual([]);
        expect(nextSpy).not.toHaveBeenCalled();
        expect(completeSpy).not.toHaveBeenCalled();
        pending.flush(counts);

        expect(nextSpy).toHaveBeenCalledExactlyOnceWith(counts);
        expect(completeSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy).not.toHaveBeenCalled();
      },
    );

    it.each([
      { status: 401, statusText: 'Unauthorized' },
      { status: 500, statusText: 'Internal Server Error' },
    ])(
      'should propagate HTTP $status without replacing a count failure with zeros',
      ({ status, statusText }) => {
        const nextSpy = vi.fn();
        const completeSpy = vi.fn();
        const errorSpy = vi.fn();
        const errorBody = { message: statusText };
        service
          .getUnreadMessageCounts()
          .subscribe({ next: nextSpy, complete: completeSpy, error: errorSpy });

        httpTesting.expectOne(url).flush(errorBody, { status, statusText });

        expect(nextSpy).not.toHaveBeenCalled();
        expect(completeSpy).not.toHaveBeenCalled();
        expect(errorSpy).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ status, error: errorBody }),
        );
      },
    );
  });
});
