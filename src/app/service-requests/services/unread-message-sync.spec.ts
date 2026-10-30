import { Component, DOCUMENT, inject, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { throwError } from 'rxjs';
import { AuthSession } from '../../auth/services/auth-session';
import { authInterceptor } from '../../auth/interceptors/auth-interceptor';
import { CurrentUserResponse } from '../../models/auth.model';
import { unreadMessageState } from './unread-message-store';
import { UnreadMessageSync } from './unread-message-sync';

@Component({ template: '', providers: [UnreadMessageSync] })
class UnreadMessageSyncHost {
  constructor() {
    inject(UnreadMessageSync);
  }
}

describe('UnreadMessageSync', () => {
  const url = 'http://localhost:3000/service-requests/messages/unread-counts';
  const userA: CurrentUserResponse = {
    id: 8,
    firstName: 'Alice',
    lastName: 'Martin',
    email: 'alice@example.com',
  };
  const userB: CurrentUserResponse = {
    id: 9,
    firstName: 'Bruno',
    lastName: 'Leroy',
    email: 'bruno@example.com',
  };
  const authSessionStub = {
    currentUser: signal<CurrentUserResponse | null>(null),
    reauthenticationRequired: signal(false),
    accessToken: signal<string | null>(null),
    logout: vi.fn(),
    requiredReauthentication: vi.fn(),
    renewAccessToken: vi.fn(),
  };
  let fixture: ComponentFixture<UnreadMessageSyncHost>;
  let httpTesting: HttpTestingController;
  let countsStore: InstanceType<typeof unreadMessageState>;

  function signIn(user = userA, token = 'token-a') {
    authSessionStub.accessToken.set(token);
    authSessionStub.currentUser.set(user);
    fixture.detectChanges();
    return httpTesting.expectOne(url);
  }

  beforeEach(async () => {
    authSessionStub.currentUser.set(null);
    authSessionStub.reauthenticationRequired.set(false);
    authSessionStub.accessToken.set(null);
    const resetLocal = () => {
      authSessionStub.currentUser.set(null);
      authSessionStub.reauthenticationRequired.set(false);
      authSessionStub.accessToken.set(null);
    };
    authSessionStub.renewAccessToken
      .mockReset()
      .mockImplementation(() => throwError(() => new HttpErrorResponse({ status: 401 })));
    authSessionStub.logout.mockReset().mockImplementation(resetLocal);
    authSessionStub.requiredReauthentication.mockReset().mockImplementation(() => {
      resetLocal();
      authSessionStub.reauthenticationRequired.set(true);
    });
    await TestBed.configureTestingModule({
      imports: [UnreadMessageSyncHost],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthSession, useValue: authSessionStub },
      ],
    }).compileComponents();
    httpTesting = TestBed.inject(HttpTestingController);
    countsStore = TestBed.inject(unreadMessageState);
    fixture = TestBed.createComponent(UnreadMessageSyncHost);
  });

  afterEach(() => {
    httpTesting.verify();
    vi.restoreAllMocks();
  });

  describe('unread count polling', () => {
    const emptyCounts = { sentRequests: 0, receivedRequests: 0, total: 0 };
    let visibility: DocumentVisibilityState;

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      visibility = 'visible';
      vi.spyOn(TestBed.inject(DOCUMENT), 'visibilityState', 'get').mockImplementation(
        () => visibility,
      );
    });

    afterEach(() => {
      fixture.destroy();
      vi.useRealTimers();
    });

    describe('page visibility', () => {
      it('should still load initial counts when signed in on a hidden page and skip periodic requests', () => {
        visibility = 'hidden';

        signIn().flush({ sentRequests: 2, receivedRequests: 1, total: 3 });
        fixture.detectChanges();
        vi.advanceTimersByTime(180_000);
        fixture.detectChanges();

        expect(countsStore.counts()).toEqual({ sentRequests: 2, receivedRequests: 1, total: 3 });
        expect(countsStore.isLoading()).toBe(false);
        httpTesting.expectNone(url);
      });

      it('should preserve loaded counts and skip every tick while the page is hidden', () => {
        signIn().flush({ sentRequests: 2, receivedRequests: 1, total: 3 });
        fixture.detectChanges();
        vi.advanceTimersByTime(20_000);

        visibility = 'hidden';
        TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
        vi.advanceTimersByTime(160_000);
        fixture.detectChanges();

        expect(countsStore.counts()).toEqual({ sentRequests: 2, receivedRequests: 1, total: 3 });
        expect(countsStore.errorMessage()).toBeNull();
        httpTesting.expectNone(url);
      });

      it('should refresh immediately when becoming visible and preserve the existing polling schedule', () => {
        signIn().flush(emptyCounts);
        fixture.detectChanges();
        visibility = 'hidden';
        vi.advanceTimersByTime(100_000);
        httpTesting.expectNone(url);

        visibility = 'visible';
        TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
        const returning = httpTesting.expectOne(url);
        expect(returning.request.method).toBe('GET');
        expect(returning.request.headers.get('Authorization')).toBe('Bearer token-a');
        returning.flush({ sentRequests: 0, receivedRequests: 1, total: 1 });
        fixture.detectChanges();
        expect(countsStore.counts()).toEqual({ sentRequests: 0, receivedRequests: 1, total: 1 });

        vi.advanceTimersByTime(19_999);
        httpTesting.expectNone(url);
        vi.advanceTimersByTime(1);
        httpTesting.expectOne(url).flush(emptyCounts);
        fixture.detectChanges();
        vi.advanceTimersByTime(60_000);
        httpTesting.expectOne(url).flush(emptyCounts);
        httpTesting.expectNone(url);
      });

      it('should allow an in-flight poll to finish after the page becomes hidden without starting another', () => {
        signIn().flush(emptyCounts);
        fixture.detectChanges();
        vi.advanceTimersByTime(60_000);
        const pending = httpTesting.expectOne(url);

        visibility = 'hidden';
        TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
        vi.advanceTimersByTime(60_000);
        expect(pending.cancelled).toBe(false);
        httpTesting.expectNone(url);
        pending.flush({ sentRequests: 1, receivedRequests: 0, total: 1 });
        fixture.detectChanges();
        expect(countsStore.isLoading()).toBe(false);
        expect(countsStore.counts()).toEqual({ sentRequests: 1, receivedRequests: 0, total: 1 });
        vi.advanceTimersByTime(60_000);
        httpTesting.expectNone(url);
      });

      it('should wait for a pending refresh even after the page becomes visible again', () => {
        signIn().flush(emptyCounts);
        fixture.detectChanges();
        vi.advanceTimersByTime(60_000);
        const pending = httpTesting.expectOne(url);
        visibility = 'hidden';
        vi.advanceTimersByTime(60_000);

        visibility = 'visible';
        TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
        vi.advanceTimersByTime(60_000);
        expect(pending.cancelled).toBe(false);
        httpTesting.expectNone(url);
        pending.flush(emptyCounts);
        fixture.detectChanges();
        vi.advanceTimersByTime(60_000);
        httpTesting.expectOne(url).flush(emptyCounts);
      });

      it('should ignore visibility events while anonymous', () => {
        fixture.detectChanges();
        visibility = 'hidden';
        TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));

        visibility = 'visible';
        TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
        vi.advanceTimersByTime(180_000);

        expect(authSessionStub.currentUser()).toBeNull();
        expect(countsStore.counts()).toBeNull();
        httpTesting.expectNone(url);
      });

      it('should let a return-triggered request finish when the next periodic tick arrives', () => {
        signIn().flush(emptyCounts);
        fixture.detectChanges();
        visibility = 'hidden';
        vi.advanceTimersByTime(40_000);

        visibility = 'visible';
        TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
        const pending = httpTesting.expectOne(url);
        vi.advanceTimersByTime(20_000);
        fixture.detectChanges();
        expect(pending.cancelled).toBe(false);
        expect(countsStore.isLoading()).toBe(true);
        httpTesting.expectNone(url);

        pending.flush({ sentRequests: 2, receivedRequests: 0, total: 2 });
        fixture.detectChanges();
        vi.advanceTimersByTime(60_000);
        httpTesting.expectOne(url).flush(emptyCounts);
        httpTesting.expectNone(url);
      });

      it('should keep listening and allow another return-triggered refresh after a server error', () => {
        signIn().flush(emptyCounts);
        fixture.detectChanges();
        visibility = 'hidden';
        TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
        httpTesting.expectNone(url);
        visibility = 'visible';
        TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
        httpTesting
          .expectOne(url)
          .flush(
            { message: 'Server failure' },
            { status: 500, statusText: 'Internal Server Error' },
          );
        fixture.detectChanges();
        expect(countsStore.errorMessage()).toBe('Impossible de charger les compteurs de messages.');
        expect(authSessionStub.currentUser()).toEqual(userA);

        visibility = 'hidden';
        TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
        httpTesting.expectNone(url);
        visibility = 'visible';
        TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
        const retry = httpTesting.expectOne(url);
        expect(countsStore.errorMessage()).toBeNull();
        retry.flush({ sentRequests: 1, receivedRequests: 0, total: 1 });
        fixture.detectChanges();
        expect(countsStore.counts()).toEqual({ sentRequests: 1, receivedRequests: 0, total: 1 });
        httpTesting.expectNone(url);
      });

      it('should stop return-triggered refreshes and polling after token renewal fails', () => {
        signIn().flush(emptyCounts);
        fixture.detectChanges();
        visibility = 'hidden';
        TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
        visibility = 'visible';
        TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));

        httpTesting
          .expectOne(url)
          .flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
        fixture.detectChanges();
        visibility = 'hidden';
        TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
        visibility = 'visible';
        TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
        vi.advanceTimersByTime(180_000);

        expect(authSessionStub.requiredReauthentication).toHaveBeenCalledTimes(1);
        expect(authSessionStub.logout).not.toHaveBeenCalled();
        expect(authSessionStub.currentUser()).toBeNull();
        expect(countsStore.counts()).toBeNull();
        expect(countsStore.errorMessage()).toBeNull();
        httpTesting.expectNone(url);
      });

      it('should remove the previous account visibility listener and refresh only with the new token', () => {
        const document = TestBed.inject(DOCUMENT);
        const addListener = vi.spyOn(document, 'addEventListener');
        const removeListener = vi.spyOn(document, 'removeEventListener');
        signIn().flush(emptyCounts);
        fixture.detectChanges();
        const oldListeners = addListener.mock.calls.filter(
          ([event]) => event === 'visibilitychange',
        );
        expect(oldListeners).toHaveLength(1);
        const oldHandler = oldListeners[0][1];
        visibility = 'hidden';
        document.dispatchEvent(new Event('visibilitychange'));

        signIn(userB, 'token-b').flush(emptyCounts);
        fixture.detectChanges();

        expect(
          removeListener.mock.calls.some(
            ([event, handler]) => event === 'visibilitychange' && handler === oldHandler,
          ),
        ).toBe(true);
        expect(
          addListener.mock.calls.filter(([event]) => event === 'visibilitychange'),
        ).toHaveLength(2);
        visibility = 'visible';
        document.dispatchEvent(new Event('visibilitychange'));
        const returning = httpTesting.expectOne(url);
        expect(returning.request.headers.get('Authorization')).toBe('Bearer token-b');
        returning.flush({ sentRequests: 0, receivedRequests: 4, total: 4 });
        fixture.detectChanges();
        expect(countsStore.counts()).toEqual({ sentRequests: 0, receivedRequests: 4, total: 4 });
        expect(authSessionStub.currentUser()).toEqual(userB);
        httpTesting.expectNone(url);
      });

      it('should remove the visibility listener on host destruction and ignore later browser events', () => {
        const document = TestBed.inject(DOCUMENT);
        const addListener = vi.spyOn(document, 'addEventListener');
        const removeListener = vi.spyOn(document, 'removeEventListener');
        signIn().flush(emptyCounts);
        fixture.detectChanges();
        const listeners = addListener.mock.calls.filter(([event]) => event === 'visibilitychange');
        expect(listeners).toHaveLength(1);
        const handler = listeners[0][1];

        fixture.destroy();

        expect(
          removeListener.mock.calls.some(
            ([event, removed]) => event === 'visibilitychange' && removed === handler,
          ),
        ).toBe(true);
        visibility = 'hidden';
        document.dispatchEvent(new Event('visibilitychange'));
        visibility = 'visible';
        document.dispatchEvent(new Event('visibilitychange'));
        vi.advanceTimersByTime(180_000);
        expect(authSessionStub.currentUser()).toEqual(userA);
        httpTesting.expectNone(url);
      });

      it('should not restart polling when the page becomes visible after logout while hidden', () => {
        signIn().flush(emptyCounts);
        fixture.detectChanges();
        visibility = 'hidden';
        vi.advanceTimersByTime(20_000);

        authSessionStub.logout();
        fixture.detectChanges();
        visibility = 'visible';
        TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
        vi.advanceTimersByTime(180_000);
        fixture.detectChanges();

        expect(authSessionStub.currentUser()).toBeNull();
        expect(countsStore.counts()).toBeNull();
        httpTesting.expectNone(url);
      });
    });

    it('should not start a polling request for anonymous visitors', () => {
      fixture.detectChanges();

      vi.advanceTimersByTime(180_000);
      fixture.detectChanges();

      httpTesting.expectNone(url);
      expect(countsStore.counts()).toBeNull();
    });

    it('should leave a slow initial request pending and resume polling after it finishes', () => {
      const initial = signIn();

      vi.advanceTimersByTime(120_000);
      fixture.detectChanges();

      expect(initial.cancelled).toBe(false);
      expect(countsStore.isLoading()).toBe(true);
      httpTesting.expectNone(url);
      initial.flush(emptyCounts);
      fixture.detectChanges();
      vi.advanceTimersByTime(60_000);
      httpTesting.expectOne(url).flush(emptyCounts);
    });

    it('should skip polling ticks while a periodic request is pending without cancelling it', () => {
      signIn().flush(emptyCounts);
      fixture.detectChanges();
      vi.advanceTimersByTime(60_000);
      const pendingPoll = httpTesting.expectOne(url);

      vi.advanceTimersByTime(180_000);
      fixture.detectChanges();

      expect(pendingPoll.cancelled).toBe(false);
      httpTesting.expectNone(url);
      pendingPoll.flush({ sentRequests: 1, receivedRequests: 0, total: 1 });
      fixture.detectChanges();
      vi.advanceTimersByTime(60_000);
      httpTesting.expectOne(url).flush(emptyCounts);
    });

    it('should retry at the next tick after a server error and keep the session authenticated', () => {
      signIn().flush(emptyCounts);
      fixture.detectChanges();
      vi.advanceTimersByTime(60_000);
      httpTesting
        .expectOne(url)
        .flush({ message: 'Server failure' }, { status: 500, statusText: 'Internal Server Error' });
      fixture.detectChanges();
      expect(countsStore.errorMessage()).toBe('Impossible de charger les compteurs de messages.');
      expect(authSessionStub.currentUser()).toEqual(userA);
      expect(authSessionStub.logout).not.toHaveBeenCalled();
      expect(authSessionStub.requiredReauthentication).not.toHaveBeenCalled();

      vi.advanceTimersByTime(60_000);
      const retry = httpTesting.expectOne(url);
      expect(countsStore.errorMessage()).toBeNull();
      retry.flush({ sentRequests: 0, receivedRequests: 1, total: 1 });
      fixture.detectChanges();
      expect(countsStore.counts()).toEqual({ sentRequests: 0, receivedRequests: 1, total: 1 });
      httpTesting.expectNone(url);
    });

    it('should keep one polling schedule and wait for a manual refresh that crosses a tick', () => {
      signIn().flush(emptyCounts);
      fixture.detectChanges();
      vi.advanceTimersByTime(20_000);
      countsStore.refresh();
      const manualRefresh = httpTesting.expectOne(url);

      vi.advanceTimersByTime(40_000);
      fixture.detectChanges();

      expect(manualRefresh.cancelled).toBe(false);
      httpTesting.expectNone(url);
      manualRefresh.flush({ sentRequests: 2, receivedRequests: 0, total: 2 });
      fixture.detectChanges();
      vi.advanceTimersByTime(59_999);
      httpTesting.expectNone(url);
      vi.advanceTimersByTime(1);
      httpTesting.expectOne(url).flush(emptyCounts);
      fixture.detectChanges();
      httpTesting.expectNone(url);
    });

    it('should cancel a pending poll and stop subsequent ticks after manual logout', () => {
      signIn().flush(emptyCounts);
      fixture.detectChanges();
      vi.advanceTimersByTime(60_000);
      const pendingPoll = httpTesting.expectOne(url);

      authSessionStub.logout();
      fixture.detectChanges();
      vi.advanceTimersByTime(180_000);
      fixture.detectChanges();

      expect(pendingPoll.cancelled).toBe(true);
      expect(countsStore.counts()).toBeNull();
      expect(countsStore.isLoading()).toBe(false);
      expect(authSessionStub.currentUser()).toBeNull();
      httpTesting.expectNone(url);
    });

    it('should replace the previous account schedule with a fresh one using the new token', () => {
      signIn().flush(emptyCounts);
      fixture.detectChanges();
      vi.advanceTimersByTime(20_000);
      signIn(userB, 'token-b').flush(emptyCounts);
      fixture.detectChanges();

      vi.advanceTimersByTime(40_000);
      httpTesting.expectNone(url);
      vi.advanceTimersByTime(19_999);
      httpTesting.expectNone(url);
      vi.advanceTimersByTime(1);
      const newPoll = httpTesting.expectOne(url);
      expect(newPoll.request.headers.get('Authorization')).toBe('Bearer token-b');
      newPoll.flush({ sentRequests: 0, receivedRequests: 4, total: 4 });
      fixture.detectChanges();
      vi.advanceTimersByTime(60_000);
      httpTesting.expectOne(url).flush(emptyCounts);
      expect(authSessionStub.currentUser()).toEqual(userB);
      httpTesting.expectNone(url);
    });

    it('should stop polling after an expired token cannot be renewed', () => {
      signIn().flush(emptyCounts);
      fixture.detectChanges();
      vi.advanceTimersByTime(60_000);

      httpTesting
        .expectOne(url)
        .flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });
      fixture.detectChanges();
      vi.advanceTimersByTime(180_000);
      fixture.detectChanges();

      expect(authSessionStub.requiredReauthentication).toHaveBeenCalledTimes(1);
      expect(authSessionStub.logout).not.toHaveBeenCalled();
      expect(authSessionStub.currentUser()).toBeNull();
      expect(countsStore.counts()).toBeNull();
      expect(countsStore.errorMessage()).toBeNull();
      httpTesting.expectNone(url);
    });

    it('should stop its timer when its component host is destroyed even while the account remains signed in', () => {
      signIn().flush(emptyCounts);
      fixture.detectChanges();
      vi.advanceTimersByTime(59_999);

      fixture.destroy();
      vi.advanceTimersByTime(180_000);

      expect(authSessionStub.currentUser()).toEqual(userA);
      httpTesting.expectNone(url);
    });
  });
});
