import { TestBed } from '@angular/core/testing';
import { io } from 'socket.io-client';
import { ServiceRequestRealtime, type ConversationChangedEvent } from './service-request-realtime';

vi.mock('socket.io-client', () => ({ io: vi.fn() }));

describe('ServiceRequestRealtime', () => {
  const ioMock = vi.mocked(io);
  let service: ServiceRequestRealtime;

  function createSocket() {
    const listeners = new Map<string, (event: ConversationChangedEvent) => void>();
    return {
      on: vi.fn((event: string, listener: (value: ConversationChangedEvent) => void) => {
        listeners.set(event, listener);
      }),
      connect: vi.fn(),
      removeAllListeners: vi.fn(() => listeners.clear()),
      disconnect: vi.fn(),
      receive(event: ConversationChangedEvent) {
        listeners.get('conversation.changed')?.(event);
      },
    };
  }

  beforeEach(() => {
    ioMock.mockReset();
    TestBed.configureTestingModule({});
    service = TestBed.inject(ServiceRequestRealtime);
  });

  afterEach(() => service.disconnect());

  function useSocket(socket: ReturnType<typeof createSocket>) {
    ioMock.mockReturnValueOnce(socket as unknown as ReturnType<typeof io>);
  }

  it('should create one shared injectable service without opening a connection', () => {
    expect(TestBed.inject(ServiceRequestRealtime)).toBe(service);
    expect(ioMock).not.toHaveBeenCalled();
    expect('next' in service.conversationChanged$).toBe(false);
  });

  it('should send the access token to the private namespace and install the listener before connecting', () => {
    const socket = createSocket();
    useSocket(socket);

    service.connect('access-token');

    expect(ioMock).toHaveBeenCalledExactlyOnceWith(
      'http://localhost:3000/service-request-messages',
      { autoConnect: false, auth: { accessToken: 'access-token' } },
    );
    expect(socket.on).toHaveBeenCalledExactlyOnceWith('conversation.changed', expect.any(Function));
    expect(socket.connect).toHaveBeenCalledOnce();
    expect(socket.on.mock.invocationCallOrder[0]).toBeLessThan(
      socket.connect.mock.invocationCallOrder[0],
    );
  });

  it('should forward successive notifications to all subscribers through one connection', () => {
    const socket = createSocket();
    useSocket(socket);
    const first = vi.fn();
    const second = vi.fn();
    const firstSubscription = service.conversationChanged$.subscribe(first);
    const secondSubscription = service.conversationChanged$.subscribe(second);
    service.connect('access-token');

    socket.receive({ serviceRequestId: 42 });
    socket.receive({ serviceRequestId: 43 });

    for (const observer of [first, second]) {
      expect(observer.mock.calls).toEqual([[{ serviceRequestId: 42 }], [{ serviceRequestId: 43 }]]);
    }
    expect(ioMock).toHaveBeenCalledOnce();
    firstSubscription.unsubscribe();
    secondSubscription.unsubscribe();
  });

  it('should receive a notification arriving immediately when the connection opens', () => {
    const socket = createSocket();
    useSocket(socket);
    socket.connect.mockImplementation(() => socket.receive({ serviceRequestId: 42 }));
    const observer = vi.fn();
    const subscription = service.conversationChanged$.subscribe(observer);

    service.connect('access-token');

    expect(observer).toHaveBeenCalledExactlyOnceWith({ serviceRequestId: 42 });
    subscription.unsubscribe();
  });

  it('should let one subscriber unsubscribe without stopping other subscribers', () => {
    const socket = createSocket();
    useSocket(socket);
    const first = vi.fn();
    const second = vi.fn();
    const firstSubscription = service.conversationChanged$.subscribe(first);
    const secondSubscription = service.conversationChanged$.subscribe(second);
    service.connect('access-token');
    firstSubscription.unsubscribe();

    socket.receive({ serviceRequestId: 42 });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledExactlyOnceWith({ serviceRequestId: 42 });
    expect(socket.disconnect).not.toHaveBeenCalled();
    secondSubscription.unsubscribe();
  });

  it('should remove listeners and close the previous connection before opening with a new token', () => {
    const firstSocket = createSocket();
    const secondSocket = createSocket();
    useSocket(firstSocket);
    useSocket(secondSocket);
    service.connect('old-token');

    service.connect('new-token');

    expect(firstSocket.removeAllListeners).toHaveBeenCalledOnce();
    expect(firstSocket.disconnect).toHaveBeenCalledOnce();
    expect(firstSocket.removeAllListeners.mock.invocationCallOrder[0]).toBeLessThan(
      firstSocket.disconnect.mock.invocationCallOrder[0],
    );
    expect(firstSocket.disconnect.mock.invocationCallOrder[0]).toBeLessThan(
      ioMock.mock.invocationCallOrder[1],
    );
    expect(ioMock).toHaveBeenLastCalledWith('http://localhost:3000/service-request-messages', {
      autoConnect: false,
      auth: { accessToken: 'new-token' },
    });
    expect(secondSocket.connect).toHaveBeenCalledOnce();
  });

  it('should keep existing subscribers while replacing the connection and ignore the removed listener', () => {
    const firstSocket = createSocket();
    const secondSocket = createSocket();
    useSocket(firstSocket);
    useSocket(secondSocket);
    const observer = vi.fn();
    const subscription = service.conversationChanged$.subscribe(observer);
    service.connect('old-token');
    service.connect('new-token');

    firstSocket.receive({ serviceRequestId: 1 });
    secondSocket.receive({ serviceRequestId: 42 });

    expect(observer).toHaveBeenCalledExactlyOnceWith({ serviceRequestId: 42 });
    subscription.unsubscribe();
  });

  it('should safely disconnect before any connection has been created', () => {
    expect(() => service.disconnect()).not.toThrow();
    expect(ioMock).not.toHaveBeenCalled();
  });

  it('should clean up the socket only once when disconnect is repeated', () => {
    const socket = createSocket();
    useSocket(socket);
    service.connect('access-token');

    service.disconnect();
    service.disconnect();

    expect(socket.removeAllListeners).toHaveBeenCalledOnce();
    expect(socket.disconnect).toHaveBeenCalledOnce();
  });

  it('should stop forwarding events after disconnection without completing the observable', () => {
    const socket = createSocket();
    useSocket(socket);
    const next = vi.fn();
    const complete = vi.fn();
    const subscription = service.conversationChanged$.subscribe({ next, complete });
    service.connect('access-token');
    service.disconnect();

    socket.receive({ serviceRequestId: 42 });

    expect(next).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    subscription.unsubscribe();
  });
});
