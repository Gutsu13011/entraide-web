import { Component, inject, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { Subject, tap, throwError, finalize } from 'rxjs';
import { AuthSession } from '../../auth/services/auth-session';
import { CurrentUserResponse } from '../../models/auth.model';
import { unreadMessageState } from './unread-message-store';
import { ServiceRequestRealtime, type ConversationChangedEvent } from './service-request-realtime';
import { ServiceRequestRealtimeSession } from './service-request-realtime-session';

@Component({ template: '', providers: [ServiceRequestRealtimeSession] })
class RealtimeSessionHost {
  constructor() {
    inject(ServiceRequestRealtimeSession);
  }
}

let conversationChanges = new Subject<ConversationChangedEvent>();
let connectedEvents = new Subject<void>();
let renewalEvents = new Subject<void>();
const realtimeStub = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  conversationChanged$: conversationChanges.asObservable(),
  connected$: connectedEvents.asObservable(),
  renewalRequested$: renewalEvents.asObservable(),
};

beforeEach(() => {
  conversationChanges = new Subject<ConversationChangedEvent>();
  connectedEvents = new Subject<void>();
  renewalEvents = new Subject<void>();
  realtimeStub.renewalRequested$ = renewalEvents.asObservable();
  realtimeStub.connected$ = connectedEvents.asObservable();
  realtimeStub.conversationChanged$ = conversationChanges.asObservable();
  realtimeStub.connect.mockReset();
  realtimeStub.disconnect.mockReset();
});

describe('ServiceRequestRealtimeSession', () => {
  const user: CurrentUserResponse = {
    id: 8,
    firstName: 'Alice',
    lastName: 'Martin',
    email: 'alice@example.test',
  };
  const auth = {
    accessToken: signal<string | null>(null),
    currentUser: signal<CurrentUserResponse | null>(null),
    reauthenticationRequired: signal(false),
    logout: vi.fn(),
    renewAccessToken: vi.fn(),
    requiredReauthentication: vi.fn(),
  };
  const unrelatedStatus = signal('idle');
  const unread = { refresh: vi.fn() };
  let fixture: ComponentFixture<RealtimeSessionHost>;

  beforeEach(async () => {
    auth.accessToken.set(null);
    auth.currentUser.set(null);
    auth.reauthenticationRequired.set(false);
    auth.logout.mockReset().mockImplementation(() => {
      auth.accessToken.set(null);
      auth.currentUser.set(null);
    });
    auth.renewAccessToken.mockReset().mockReturnValue(new Subject<string>());
    auth.requiredReauthentication.mockReset().mockImplementation(() => {
      auth.accessToken.set(null);
      auth.currentUser.set(null);
      auth.reauthenticationRequired.set(true);
    });
    unrelatedStatus.set('idle');
    unread.refresh.mockReset();
    await TestBed.configureTestingModule({
      imports: [RealtimeSessionHost],
      providers: [
        { provide: AuthSession, useValue: auth },
        { provide: unreadMessageState, useValue: unread },
        { provide: ServiceRequestRealtime, useValue: realtimeStub },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(RealtimeSessionHost);
  });

  afterEach(() => {
    fixture.destroy();
    vi.restoreAllMocks();
  });

  function signIn(token = 'first-token') {
    auth.accessToken.set(token);
    auth.currentUser.set(user);
    fixture.detectChanges();
  }

  it('should not open a connection for an anonymous session', () => {
    fixture.detectChanges();
    expect(realtimeStub.connect).not.toHaveBeenCalled();
    expect(realtimeStub.disconnect).not.toHaveBeenCalled();
  });

  it.each(['token-only', 'user-only'])(
    'should not connect with an incomplete session: %s',
    (state) => {
      if (state === 'token-only') auth.accessToken.set('first-token');
      else auth.currentUser.set(user);
      fixture.detectChanges();
      expect(realtimeStub.connect).not.toHaveBeenCalled();
    },
  );

  it('should open one connection for an already restored session', () => {
    signIn();
    expect(realtimeStub.connect).toHaveBeenCalledExactlyOnceWith('first-token');
  });

  it('should connect when an initially anonymous session signs in', () => {
    fixture.detectChanges();
    signIn();
    expect(realtimeStub.connect).toHaveBeenCalledExactlyOnceWith('first-token');
  });

  it('should retain the connection across unrelated renders', () => {
    signIn();
    fixture.detectChanges();
    fixture.detectChanges();
    expect(realtimeStub.connect).toHaveBeenCalledOnce();
    expect(realtimeStub.disconnect).not.toHaveBeenCalled();
  });

  it('should disconnect before reconnecting when only the access token changes', () => {
    signIn();
    auth.accessToken.set('renewed-token');
    fixture.detectChanges();
    expect(realtimeStub.disconnect).toHaveBeenCalledOnce();
    expect(realtimeStub.connect.mock.calls).toEqual([['first-token'], ['renewed-token']]);
    expect(realtimeStub.disconnect.mock.invocationCallOrder[0]).toBeLessThan(
      realtimeStub.connect.mock.invocationCallOrder[1],
    );
  });

  it('should close the previous connection before switching accounts', () => {
    signIn();
    auth.currentUser.set({ ...user, id: 9, firstName: 'Bruno' });
    auth.accessToken.set('other-account-token');
    fixture.detectChanges();
    expect(realtimeStub.disconnect).toHaveBeenCalledOnce();
    expect(realtimeStub.connect.mock.calls).toEqual([['first-token'], ['other-account-token']]);
    expect(realtimeStub.disconnect.mock.invocationCallOrder[0]).toBeLessThan(
      realtimeStub.connect.mock.invocationCallOrder[1],
    );
  });

  it('should disconnect after logout without reopening an anonymous connection', () => {
    signIn();
    auth.logout();
    fixture.detectChanges();
    expect(realtimeStub.disconnect).toHaveBeenCalledOnce();
    expect(realtimeStub.connect).toHaveBeenCalledOnce();
  });

  it('should clean up if either required session value disappears', () => {
    signIn();
    auth.accessToken.set(null);
    fixture.detectChanges();
    expect(realtimeStub.disconnect).toHaveBeenCalledOnce();
    expect(realtimeStub.connect).toHaveBeenCalledOnce();
    auth.accessToken.set('second-token');
    fixture.detectChanges();
    auth.currentUser.set(null);
    fixture.detectChanges();
    expect(realtimeStub.disconnect).toHaveBeenCalledTimes(2);
    expect(realtimeStub.connect.mock.calls).toEqual([['first-token'], ['second-token']]);
  });

  it('should reconnect normally after logout followed by a new login', () => {
    signIn();
    auth.logout();
    fixture.detectChanges();
    signIn('second-token');
    expect(realtimeStub.connect.mock.calls).toEqual([['first-token'], ['second-token']]);
    expect(realtimeStub.disconnect).toHaveBeenCalledOnce();
  });

  it('should disconnect when its component host is destroyed', () => {
    signIn();
    fixture.destroy();
    expect(realtimeStub.disconnect).toHaveBeenCalledOnce();
  });

  it('should not track signals read inside the realtime connect method', () => {
    realtimeStub.connect.mockImplementation(() => {
      unrelatedStatus();
    });
    signIn();
    unrelatedStatus.set('connected');
    fixture.detectChanges();
    expect(realtimeStub.connect).toHaveBeenCalledOnce();
    expect(realtimeStub.disconnect).not.toHaveBeenCalled();
  });
  it('should refresh shared counts once per event without duplicating subscriptions on renders', () => {
    signIn();
    fixture.detectChanges();
    fixture.detectChanges();
    unread.refresh.mockClear();

    conversationChanges.next({ serviceRequestId: 42 });
    conversationChanges.next({ serviceRequestId: 43 });

    expect(unread.refresh).toHaveBeenCalledTimes(2);
    expect(realtimeStub.connect).toHaveBeenCalledOnce();
  });

  it('should install the notification subscription before opening the socket', () => {
    realtimeStub.connect.mockImplementation(() =>
      conversationChanges.next({ serviceRequestId: 42 }),
    );
    signIn();
    expect(unread.refresh).toHaveBeenCalledOnce();
  });

  it('should ignore queued events immediately after logout and unsubscribe during cleanup', () => {
    signIn();
    unread.refresh.mockClear();
    auth.logout();

    conversationChanges.next({ serviceRequestId: 42 });
    expect(unread.refresh).not.toHaveBeenCalled();
    fixture.detectChanges();
    expect(conversationChanges.observed).toBe(false);
    conversationChanges.next({ serviceRequestId: 42 });
    expect(unread.refresh).not.toHaveBeenCalled();
  });

  it('should ignore old-session events while account switching is awaiting effect cleanup', () => {
    signIn();
    unread.refresh.mockClear();
    auth.currentUser.set({ ...user, id: 9, firstName: 'Bruno' });
    auth.accessToken.set('other-token');

    conversationChanges.next({ serviceRequestId: 42 });
    expect(unread.refresh).not.toHaveBeenCalled();
    fixture.detectChanges();
    unread.refresh.mockClear();
    conversationChanges.next({ serviceRequestId: 43 });
    expect(unread.refresh).toHaveBeenCalledOnce();
  });

  it('should ignore queued old-token events and retain only one subscription after renewal', () => {
    signIn();
    unread.refresh.mockClear();
    auth.accessToken.set('renewed-token');

    conversationChanges.next({ serviceRequestId: 42 });
    expect(unread.refresh).not.toHaveBeenCalled();
    fixture.detectChanges();
    conversationChanges.next({ serviceRequestId: 43 });
    expect(unread.refresh).toHaveBeenCalledOnce();
  });

  it('should unsubscribe from conversation events when its component host is destroyed', () => {
    signIn();
    unread.refresh.mockClear();

    fixture.destroy();
    conversationChanges.next({ serviceRequestId: 42 });

    expect(conversationChanges.observed).toBe(false);
    expect(unread.refresh).not.toHaveBeenCalled();
    expect(realtimeStub.disconnect).toHaveBeenCalledOnce();
  });

  it('should leave no anonymous subscription and create one when the user signs in', () => {
    fixture.detectChanges();
    expect(conversationChanges.observed).toBe(false);
    conversationChanges.next({ serviceRequestId: 42 });
    expect(unread.refresh).not.toHaveBeenCalled();
    signIn();
    expect(conversationChanges.observed).toBe(true);
  });
  it('should subscribe to connection events before the initial socket opens and refresh on every reconnection', () => {
    realtimeStub.connect.mockImplementation(() => connectedEvents.next());
    signIn();
    expect(unread.refresh).toHaveBeenCalledOnce();
    connectedEvents.next();
    expect(unread.refresh).toHaveBeenCalledTimes(2);
    expect(realtimeStub.connect).toHaveBeenCalledOnce();
  });

  it('should ignore queued connection events after logout and remove the subscription on cleanup', () => {
    signIn();
    unread.refresh.mockClear();
    auth.logout();
    connectedEvents.next();
    expect(unread.refresh).not.toHaveBeenCalled();
    fixture.detectChanges();
    expect(connectedEvents.observed).toBe(false);
  });

  it.each(['token', 'account'])(
    'should reject queued old-session connection events after a %s change',
    (change) => {
      signIn();
      unread.refresh.mockClear();
      if (change === 'token') auth.accessToken.set('renewed-token');
      else auth.currentUser.set({ ...user, id: 9 });
      connectedEvents.next();
      expect(unread.refresh).not.toHaveBeenCalled();
      fixture.detectChanges();
      unread.refresh.mockClear();
      connectedEvents.next();
      expect(unread.refresh).toHaveBeenCalledOnce();
    },
  );

  it('should remove both realtime subscriptions when its component host is destroyed', () => {
    signIn();
    unread.refresh.mockClear();
    fixture.destroy();
    expect(connectedEvents.observed).toBe(false);
    expect(conversationChanges.observed).toBe(false);
    connectedEvents.next();
    conversationChanges.next({ serviceRequestId: 42 });
    expect(unread.refresh).not.toHaveBeenCalled();
  });
  function pendingRenewal() {
    const response = new Subject<string>();
    auth.renewAccessToken.mockReturnValue(
      response.pipe(tap((token) => auth.accessToken.set(token))),
    );
    return response;
  }

  it('should ignore renewal requests without an authenticated session', () => {
    fixture.detectChanges();
    renewalEvents.next();
    expect(auth.renewAccessToken).not.toHaveBeenCalled();
    expect(renewalEvents.observed).toBe(false);
  });

  it('should listen for authentication recovery before opening the socket', () => {
    realtimeStub.connect.mockImplementation(() => renewalEvents.next());
    signIn();
    expect(auth.renewAccessToken).toHaveBeenCalledOnce();
  });

  it('should exhaust simultaneous renewal requests and reconnect once with the updated token', () => {
    const response = pendingRenewal();
    signIn();
    renewalEvents.next();
    renewalEvents.next();
    renewalEvents.next();
    expect(auth.renewAccessToken).toHaveBeenCalledOnce();
    response.next('renewed-token');
    response.complete();
    fixture.detectChanges();
    expect(realtimeStub.connect.mock.calls).toEqual([['first-token'], ['renewed-token']]);
    expect(auth.currentUser()).toBe(user);
    expect(auth.requiredReauthentication).not.toHaveBeenCalled();
  });

  it.each([0, 401, 500])(
    'should request reauthentication after recovery fails with HTTP %s',
    (status) => {
      auth.renewAccessToken.mockReturnValue(throwError(() => new HttpErrorResponse({ status })));
      signIn();
      renewalEvents.next();
      fixture.detectChanges();
      expect(auth.requiredReauthentication).toHaveBeenCalledOnce();
      expect(auth.currentUser()).toBeNull();
      expect(auth.logout).not.toHaveBeenCalled();
      expect(realtimeStub.disconnect).toHaveBeenCalledOnce();
    },
  );

  it.each(['token', 'account'])(
    'should ignore queued recovery requests after a %s change before cleanup',
    (change) => {
      signIn();
      if (change === 'token') auth.accessToken.set('other-token');
      else auth.currentUser.set({ ...user, id: 9 });
      renewalEvents.next();
      expect(auth.renewAccessToken).not.toHaveBeenCalled();
      expect(auth.requiredReauthentication).not.toHaveBeenCalled();
    },
  );

  it('should ignore repeated old-socket requests after renewal succeeds but before the effect restarts', () => {
    const response = pendingRenewal();
    signIn();
    renewalEvents.next();
    response.next('renewed-token');
    response.complete();
    renewalEvents.next();
    expect(auth.renewAccessToken).toHaveBeenCalledOnce();
    expect(auth.requiredReauthentication).not.toHaveBeenCalled();
    fixture.detectChanges();
  });

  it('should stop a repeated authentication refusal before any successful connection instead of looping', () => {
    const response = pendingRenewal();
    signIn();
    renewalEvents.next();
    response.next('renewed-token');
    response.complete();
    fixture.detectChanges();
    renewalEvents.next();
    fixture.detectChanges();
    expect(auth.renewAccessToken).toHaveBeenCalledOnce();
    expect(auth.requiredReauthentication).toHaveBeenCalledOnce();
    expect(auth.reauthenticationRequired()).toBe(true);
  });

  it('should allow a new recovery attempt after the renewed connection succeeds', () => {
    const first = pendingRenewal();
    signIn();
    renewalEvents.next();
    first.next('renewed-token');
    first.complete();
    fixture.detectChanges();
    connectedEvents.next();
    const second = pendingRenewal();
    renewalEvents.next();
    expect(auth.renewAccessToken).toHaveBeenCalledTimes(2);
    second.next('next-token');
    second.complete();
    fixture.detectChanges();
    expect(realtimeStub.connect).toHaveBeenLastCalledWith('next-token');
    expect(auth.requiredReauthentication).not.toHaveBeenCalled();
  });

  it('should not reset the recovery limit from a conversation notification alone', () => {
    const response = pendingRenewal();
    signIn();
    renewalEvents.next();
    response.next('renewed-token');
    response.complete();
    fixture.detectChanges();
    conversationChanges.next({ serviceRequestId: 42 });
    renewalEvents.next();
    expect(auth.renewAccessToken).toHaveBeenCalledOnce();
    expect(auth.requiredReauthentication).toHaveBeenCalledOnce();
    fixture.detectChanges();
  });

  it('should not reset the recovery limit from a queued old-token connection event', () => {
    const response = pendingRenewal();
    signIn();
    renewalEvents.next();
    response.next('renewed-token');
    response.complete();
    connectedEvents.next();
    fixture.detectChanges();
    renewalEvents.next();
    expect(auth.renewAccessToken).toHaveBeenCalledOnce();
    expect(auth.requiredReauthentication).toHaveBeenCalledOnce();
    fixture.detectChanges();
  });

  it('should explicitly reconnect if renewal returns the identical token and retain the retry limit', () => {
    const response = pendingRenewal();
    signIn();
    renewalEvents.next();
    response.next('first-token');
    response.complete();
    fixture.detectChanges();
    expect(realtimeStub.connect.mock.calls).toEqual([['first-token'], ['first-token']]);
    renewalEvents.next();
    expect(auth.renewAccessToken).toHaveBeenCalledOnce();
    expect(auth.requiredReauthentication).toHaveBeenCalledOnce();
    fixture.detectChanges();
  });

  it.each(['logout', 'account', 'destroy'])(
    'should cancel pending recovery on %s and ignore its late result',
    (change) => {
      const response = new Subject<string>();
      const teardown = vi.fn();
      auth.renewAccessToken.mockReturnValue(
        response.pipe(
          tap((token) => auth.accessToken.set(token)),
          finalize(teardown),
        ),
      );
      signIn();
      renewalEvents.next();
      expect(response.observed).toBe(true);
      if (change === 'destroy') fixture.destroy();
      else {
        if (change === 'logout') auth.logout();
        else {
          auth.currentUser.set({ ...user, id: 9 });
          auth.accessToken.set('other-token');
        }
        fixture.detectChanges();
      }
      expect(teardown).toHaveBeenCalledOnce();
      expect(response.observed).toBe(false);
      response.next('late-token');
      expect(auth.accessToken()).not.toBe('late-token');
      expect(auth.requiredReauthentication).not.toHaveBeenCalled();
    },
  );

  it('should ignore an old recovery error after an account change before cleanup', () => {
    const response = new Subject<string>();
    auth.renewAccessToken.mockReturnValue(response);
    signIn();
    renewalEvents.next();
    const other = { ...user, id: 9 };
    auth.currentUser.set(other);
    auth.accessToken.set('other-token');
    response.error(new Error('Old request failed'));
    expect(auth.currentUser()).toBe(other);
    expect(auth.accessToken()).toBe('other-token');
    expect(auth.requiredReauthentication).not.toHaveBeenCalled();
    fixture.detectChanges();
  });

  it('should permit recovery for a newly logged-in profile even with the same account id', () => {
    const first = pendingRenewal();
    signIn();
    renewalEvents.next();
    first.next('renewed-token');
    first.complete();
    fixture.detectChanges();
    auth.currentUser.set({ ...user });
    auth.accessToken.set('new-login-token');
    fixture.detectChanges();
    pendingRenewal();
    renewalEvents.next();
    expect(auth.renewAccessToken).toHaveBeenCalledTimes(2);
    expect(auth.requiredReauthentication).not.toHaveBeenCalled();
  });
});
