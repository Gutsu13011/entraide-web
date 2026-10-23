import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { finalize, NEVER, of, Subject, throwError } from 'rxjs';
import type { ServiceRequestUnreadMessageCounts } from '../../models/service-request-unread-message-counts.model';
import { ServiceRequestStore } from './service-request-store';
import { unreadMessageState } from './unread-message-store';

describe('unreadMessageState', () => {
  let store: InstanceType<typeof unreadMessageState>;
  const requestStoreStub = { getUnreadMessageCounts: vi.fn() };
  const counts: ServiceRequestUnreadMessageCounts = {
    sentRequests: 4,
    receivedRequests: 5,
    total: 9,
  };
  const errorMessage = 'Impossible de charger les compteurs de messages.';

  beforeEach(() => {
    requestStoreStub.getUnreadMessageCounts.mockReset().mockReturnValue(NEVER);
    TestBed.configureTestingModule({
      providers: [{ provide: ServiceRequestStore, useValue: requestStoreStub }],
    });
    store = TestBed.inject(unreadMessageState);
  });

  it('should start loading only on refresh and keep counts unknown until the HTTP response', () => {
    const response$ = new Subject<ServiceRequestUnreadMessageCounts>();
    requestStoreStub.getUnreadMessageCounts.mockReturnValue(response$);
    expect(requestStoreStub.getUnreadMessageCounts).not.toHaveBeenCalled();

    store.refresh();

    expect(requestStoreStub.getUnreadMessageCounts).toHaveBeenCalledExactlyOnceWith();
    expect(store.isLoading()).toBe(true);
    expect(store.counts()).toBeNull();
    expect(store.errorMessage()).toBeNull();
    response$.next(counts);
    response$.complete();
    expect(store.counts()).toEqual(counts);
    expect(store.isLoading()).toBe(false);
  });

  it.each([counts, { sentRequests: 0, receivedRequests: 0, total: 0 }])(
    'should store the API response with $total unread replies without confusing zero and unknown',
    (response) => {
      requestStoreStub.getUnreadMessageCounts.mockReturnValue(of(response));

      store.refresh();

      expect(store.counts()).toEqual(response);
      expect(store.isLoading()).toBe(false);
      expect(store.errorMessage()).toBeNull();
    },
  );

  it.each([401, 500])(
    'should clear stale counts and report a failed refresh after HTTP %s',
    (status) => {
      requestStoreStub.getUnreadMessageCounts.mockReturnValueOnce(of(counts));
      store.refresh();
      requestStoreStub.getUnreadMessageCounts.mockReturnValueOnce(
        throwError(() => new HttpErrorResponse({ status })),
      );

      store.refresh();

      expect(store.counts()).toBeNull();
      expect(store.isLoading()).toBe(false);
      expect(store.errorMessage()).toBe(errorMessage);
      expect(requestStoreStub.getUnreadMessageCounts).toHaveBeenCalledTimes(2);
    },
  );

  it('should accept another refresh after an error and clear that error while the retry is pending', () => {
    const retry$ = new Subject<ServiceRequestUnreadMessageCounts>();
    requestStoreStub.getUnreadMessageCounts
      .mockReturnValueOnce(throwError(() => new Error('Temporary failure')))
      .mockReturnValueOnce(retry$);
    store.refresh();
    expect(store.errorMessage()).toBe(errorMessage);

    store.refresh();

    expect(store.isLoading()).toBe(true);
    expect(store.errorMessage()).toBeNull();
    expect(store.counts()).toBeNull();
    retry$.next(counts);
    retry$.complete();
    expect(store.counts()).toEqual(counts);
    expect(store.isLoading()).toBe(false);
    expect(requestStoreStub.getUnreadMessageCounts).toHaveBeenCalledTimes(2);
  });

  it.each(['success', 'error'] as const)(
    'should replace a pending refresh and ignore its late %s',
    (outcome) => {
      const oldResponse$ = new Subject<ServiceRequestUnreadMessageCounts>();
      const newResponse$ = new Subject<ServiceRequestUnreadMessageCounts>();
      const teardown = vi.fn();
      const newCounts = { sentRequests: 1, receivedRequests: 2, total: 3 };
      requestStoreStub.getUnreadMessageCounts
        .mockReturnValueOnce(oldResponse$.pipe(finalize(teardown)))
        .mockReturnValueOnce(newResponse$);
      store.refresh();
      expect(teardown).not.toHaveBeenCalled();

      store.refresh();

      expect(teardown).toHaveBeenCalledTimes(1);
      expect(store.isLoading()).toBe(true);
      newResponse$.next(newCounts);
      newResponse$.complete();
      if (outcome === 'success') {
        oldResponse$.next(counts);
        oldResponse$.complete();
      } else {
        oldResponse$.error(new HttpErrorResponse({ status: 500 }));
      }
      expect(store.counts()).toEqual(newCounts);
      expect(store.isLoading()).toBe(false);
      expect(store.errorMessage()).toBeNull();
    },
  );

  it('should keep the previous counts visible while refreshing and replace them only on success', () => {
    const response$ = new Subject<ServiceRequestUnreadMessageCounts>();
    requestStoreStub.getUnreadMessageCounts
      .mockReturnValueOnce(of(counts))
      .mockReturnValueOnce(response$);
    store.refresh();

    store.refresh();

    expect(store.isLoading()).toBe(true);
    expect(store.counts()).toEqual(counts);
    const updated = { sentRequests: 0, receivedRequests: 1, total: 1 };
    response$.next(updated);
    response$.complete();
    expect(store.counts()).toEqual(updated);
    expect(store.isLoading()).toBe(false);
  });

  it('should cancel its pending refresh when the shared store injector is destroyed', () => {
    const response$ = new Subject<ServiceRequestUnreadMessageCounts>();
    const teardown = vi.fn();
    requestStoreStub.getUnreadMessageCounts.mockReturnValue(response$.pipe(finalize(teardown)));
    store.refresh();

    TestBed.resetTestingModule();

    expect(teardown).toHaveBeenCalledTimes(1);
    response$.next(counts);
    response$.complete();
    expect(store.counts()).toBeNull();
    expect(store.errorMessage()).toBeNull();
  });

  describe('reset', () => {
    it.each(['loaded', 'failed'] as const)(
      'should clear a %s store without starting another request',
      (state) => {
        requestStoreStub.getUnreadMessageCounts.mockReturnValueOnce(of(counts));
        store.refresh();
        if (state === 'failed') {
          requestStoreStub.getUnreadMessageCounts.mockReturnValueOnce(
            throwError(() => new Error('Failure')),
          );
          store.refresh();
          expect(store.errorMessage()).toBe(errorMessage);
        } else {
          expect(store.counts()).toEqual(counts);
        }
        const callsBefore = requestStoreStub.getUnreadMessageCounts.mock.calls.length;

        store.reset();

        expect(store.counts()).toBeNull();
        expect(store.isLoading()).toBe(false);
        expect(store.errorMessage()).toBeNull();
        expect(requestStoreStub.getUnreadMessageCounts).toHaveBeenCalledTimes(callsBefore);
      },
    );

    it.each(['success', 'error'] as const)(
      'should cancel a pending refresh and ignore its late %s after reset',
      (outcome) => {
        const response$ = new Subject<ServiceRequestUnreadMessageCounts>();
        const teardown = vi.fn();
        requestStoreStub.getUnreadMessageCounts.mockReturnValue(response$.pipe(finalize(teardown)));
        store.refresh();
        expect(store.isLoading()).toBe(true);
        expect(teardown).not.toHaveBeenCalled();

        store.reset();

        expect(teardown).toHaveBeenCalledTimes(1);
        if (outcome === 'success') {
          response$.next(counts);
          response$.complete();
        } else {
          response$.error(new HttpErrorResponse({ status: 500 }));
        }
        expect(store.counts()).toBeNull();
        expect(store.isLoading()).toBe(false);
        expect(store.errorMessage()).toBeNull();
      },
    );

    it('should allow refresh after resets made before and after successful requests', () => {
      store.reset();
      store.reset();
      expect(requestStoreStub.getUnreadMessageCounts).not.toHaveBeenCalled();
      requestStoreStub.getUnreadMessageCounts.mockReturnValueOnce(of(counts));

      store.refresh();

      expect(store.counts()).toEqual(counts);
      store.reset();
      const newCounts = { sentRequests: 0, receivedRequests: 0, total: 0 };
      requestStoreStub.getUnreadMessageCounts.mockReturnValueOnce(of(newCounts));
      store.refresh();
      expect(store.counts()).toEqual(newCounts);
      expect(store.isLoading()).toBe(false);
      expect(store.errorMessage()).toBeNull();
      expect(requestStoreStub.getUnreadMessageCounts).toHaveBeenCalledTimes(2);
    });

    it('should keep a new session loading and preserve its counts after resetting an older pending refresh', () => {
      const oldResponse$ = new Subject<ServiceRequestUnreadMessageCounts>();
      const newResponse$ = new Subject<ServiceRequestUnreadMessageCounts>();
      const newCounts = { sentRequests: 1, receivedRequests: 0, total: 1 };
      requestStoreStub.getUnreadMessageCounts
        .mockReturnValueOnce(oldResponse$)
        .mockReturnValueOnce(newResponse$);
      store.refresh();

      store.reset();
      store.refresh();
      oldResponse$.next(counts);
      oldResponse$.complete();

      expect(store.counts()).toBeNull();
      expect(store.isLoading()).toBe(true);
      expect(store.errorMessage()).toBeNull();
      newResponse$.next(newCounts);
      newResponse$.complete();
      expect(store.counts()).toEqual(newCounts);
      expect(store.isLoading()).toBe(false);
    });
  });
});
