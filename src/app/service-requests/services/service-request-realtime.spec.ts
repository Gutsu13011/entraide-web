import { TestBed } from '@angular/core/testing';
import { Socket } from 'socket.io-client';
import { ServiceRequestRealtime } from './service-request-realtime';

describe('ServiceRequestRealtime', () => {
  let service: ServiceRequestRealtime;
  let sockets: Socket[];

  // Exercise the real client object, but stop it before opening any network connection.
  function captureConnect(this: Socket): Socket {
    sockets.push(this);
    return this;
  }

  function receive(socket: Socket, event: string, value?: unknown): void {
    for (const listener of socket.listeners(event)) listener(value);
  }

  beforeEach(() => {
    sockets = [];
    vi.spyOn(Socket.prototype, 'connect').mockImplementation(captureConnect);
    TestBed.configureTestingModule({});
    service = TestBed.inject(ServiceRequestRealtime);
  });

  afterEach(() => {
    service.disconnect();
    vi.restoreAllMocks();
  });

  it('should create one shared injectable service without opening a connection', () => {
    expect(TestBed.inject(ServiceRequestRealtime)).toBe(service);
    expect(sockets).toHaveLength(0);
    expect('next' in service.conversationChanged$).toBe(false);
    expect('next' in service.connected$).toBe(false);
  });

  it('should configure the private namespace and token and install both listeners before connecting', () => {
    const on = vi.spyOn(Socket.prototype, 'on');
    service.connect('access-token');
    expect(sockets).toHaveLength(1);
    const socket = sockets[0];
    expect(Reflect.get(socket, 'nsp')).toBe('/service-request-messages');
    expect(Reflect.get(socket.io, 'uri')).toBe('http://localhost:3000/service-request-messages');
    expect(socket.io.opts.autoConnect).toBe(false);
    expect(socket.auth).toEqual({ accessToken: 'access-token' });
    expect(socket.listeners('conversation.changed')).toHaveLength(1);
    expect(socket.listeners('connect')).toHaveLength(1);
    expect(on.mock.invocationCallOrder.at(-1)).toBeLessThan(
      vi.mocked(Socket.prototype.connect).mock.invocationCallOrder[0],
    );
  });

  it('should forward successive notifications to all subscribers through one connection', () => {
    const first = vi.fn();
    const second = vi.fn();
    const subscriptions = [
      service.conversationChanged$.subscribe(first),
      service.conversationChanged$.subscribe(second),
    ];
    service.connect('access-token');
    receive(sockets[0], 'conversation.changed', { serviceRequestId: 42 });
    receive(sockets[0], 'conversation.changed', { serviceRequestId: 43 });
    for (const observer of [first, second]) {
      expect(observer.mock.calls).toEqual([[{ serviceRequestId: 42 }], [{ serviceRequestId: 43 }]]);
    }
    expect(sockets).toHaveLength(1);
    for (const subscription of subscriptions) subscription.unsubscribe();
  });

  it('should receive a notification arriving immediately when the connection opens', () => {
    vi.mocked(Socket.prototype.connect).mockImplementationOnce(function (this: Socket) {
      captureConnect.call(this);
      receive(this, 'conversation.changed', { serviceRequestId: 42 });
      return this;
    });
    const observer = vi.fn();
    const subscription = service.conversationChanged$.subscribe(observer);
    service.connect('access-token');
    expect(observer).toHaveBeenCalledExactlyOnceWith({ serviceRequestId: 42 });
    subscription.unsubscribe();
  });

  it('should let one subscriber unsubscribe without disconnecting other subscribers', () => {
    const first = vi.fn();
    const second = vi.fn();
    const firstSubscription = service.conversationChanged$.subscribe(first);
    const secondSubscription = service.conversationChanged$.subscribe(second);
    service.connect('access-token');
    const disconnect = vi.spyOn(sockets[0], 'disconnect');
    firstSubscription.unsubscribe();
    receive(sockets[0], 'conversation.changed', { serviceRequestId: 42 });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledExactlyOnceWith({ serviceRequestId: 42 });
    expect(disconnect).not.toHaveBeenCalled();
    secondSubscription.unsubscribe();
  });

  it('should remove old listeners and disconnect before opening with a new token', () => {
    service.connect('old-token');
    const oldSocket = sockets[0];
    const remove = vi.spyOn(oldSocket, 'removeAllListeners');
    const disconnect = vi.spyOn(oldSocket, 'disconnect');
    service.connect('new-token');
    expect(sockets).toHaveLength(2);
    expect(remove).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(remove.mock.invocationCallOrder[0]).toBeLessThan(disconnect.mock.invocationCallOrder[0]);
    expect(disconnect.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(Socket.prototype.connect).mock.invocationCallOrder[1],
    );
    expect(sockets[1].auth).toEqual({ accessToken: 'new-token' });
  });

  it('should keep subscribers while replacing the connection and remove old notification listeners', () => {
    const observer = vi.fn();
    const subscription = service.conversationChanged$.subscribe(observer);
    service.connect('old-token');
    service.connect('new-token');
    receive(sockets[0], 'conversation.changed', { serviceRequestId: 1 });
    receive(sockets[1], 'conversation.changed', { serviceRequestId: 42 });
    expect(observer).toHaveBeenCalledExactlyOnceWith({ serviceRequestId: 42 });
    subscription.unsubscribe();
  });

  it('should safely disconnect before any connection has been created', () => {
    expect(() => service.disconnect()).not.toThrow();
    expect(sockets).toHaveLength(0);
  });

  it('should clean up the socket only once when disconnect is repeated', () => {
    service.connect('access-token');
    const remove = vi.spyOn(sockets[0], 'removeAllListeners');
    const disconnect = vi.spyOn(sockets[0], 'disconnect');
    service.disconnect();
    service.disconnect();
    expect(remove).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it('should stop forwarding after disconnect without completing the public stream', () => {
    const next = vi.fn();
    const complete = vi.fn();
    const subscription = service.conversationChanged$.subscribe({ next, complete });
    service.connect('access-token');
    service.disconnect();
    receive(sockets[0], 'conversation.changed', { serviceRequestId: 42 });
    expect(next).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });

  it('should announce the initial connection and each reconnection without duplicating listeners', () => {
    const observer = vi.fn();
    const subscription = service.connected$.subscribe(observer);
    service.connect('access-token');
    expect(observer).not.toHaveBeenCalled();
    receive(sockets[0], 'connect');
    receive(sockets[0], 'connect');
    receive(sockets[0], 'connect');
    expect(observer.mock.calls).toEqual([[undefined], [undefined], [undefined]]);
    expect(sockets).toHaveLength(1);
    expect(sockets[0].listeners('connect')).toHaveLength(1);
    subscription.unsubscribe();
  });

  it('should announce a connection arriving immediately when the socket opens', () => {
    vi.mocked(Socket.prototype.connect).mockImplementationOnce(function (this: Socket) {
      captureConnect.call(this);
      receive(this, 'connect');
      return this;
    });
    const observer = vi.fn();
    const subscription = service.connected$.subscribe(observer);
    service.connect('access-token');
    expect(observer).toHaveBeenCalledOnce();
    subscription.unsubscribe();
  });

  it('should keep connection notifications separate from conversation changes', () => {
    const connected = vi.fn();
    const changed = vi.fn();
    const subscriptions = [
      service.connected$.subscribe(connected),
      service.conversationChanged$.subscribe(changed),
    ];
    service.connect('access-token');
    receive(sockets[0], 'connect');
    expect(connected).toHaveBeenCalledOnce();
    expect(changed).not.toHaveBeenCalled();
    receive(sockets[0], 'conversation.changed', { serviceRequestId: 42 });
    expect(changed).toHaveBeenCalledExactlyOnceWith({ serviceRequestId: 42 });
    expect(connected).toHaveBeenCalledOnce();
    for (const subscription of subscriptions) subscription.unsubscribe();
  });

  it('should share connection events without replaying an earlier event to late subscribers', () => {
    service.connect('access-token');
    receive(sockets[0], 'connect');
    const first = vi.fn();
    const second = vi.fn();
    const subscriptions = [
      service.connected$.subscribe(first),
      service.connected$.subscribe(second),
    ];
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    receive(sockets[0], 'connect');
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    for (const subscription of subscriptions) subscription.unsubscribe();
  });

  it('should remove the old connection listener after token replacement', () => {
    const observer = vi.fn();
    const subscription = service.connected$.subscribe(observer);
    service.connect('old-token');
    service.connect('new-token');
    receive(sockets[0], 'connect');
    expect(observer).not.toHaveBeenCalled();
    receive(sockets[1], 'connect');
    expect(observer).toHaveBeenCalledOnce();
    subscription.unsubscribe();
  });

  it('should retain the connection stream for a new login after disconnecting', () => {
    const next = vi.fn();
    const complete = vi.fn();
    const subscription = service.connected$.subscribe({ next, complete });
    service.connect('old-token');
    service.disconnect();
    receive(sockets[0], 'connect');
    expect(next).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    service.connect('new-token');
    receive(sockets[1], 'connect');
    expect(next).toHaveBeenCalledOnce();
    subscription.unsubscribe();
  });
});
