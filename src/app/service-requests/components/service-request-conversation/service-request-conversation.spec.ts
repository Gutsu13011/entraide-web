import { DATE_PIPE_DEFAULT_OPTIONS } from '@angular/common';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/core';
import { finalize, of, Subject } from 'rxjs';
import { ServiceRequestMessage } from '../../../models/service-request-message.model';
import { ServiceRequestStore } from '../../services/service-request-store';
import { ServiceRequestConversation } from './service-request-conversation';
import { AuthSession } from '../../../auth/services/auth-session';
import { unreadMessageState } from '../../services/unread-message-store';

describe('ServiceRequestConversation', () => {
  let fixture: ComponentFixture<ServiceRequestConversation>;
  let component: ServiceRequestConversation;
  let response$: Subject<ServiceRequestMessage[]>;
  const storeStub = { getMessages: vi.fn(), sendMessage: vi.fn(), markMessagesAsRead: vi.fn() };
  const authSessionStub = { currentUser: vi.fn() };
  const unreadStoreStub = { refresh: vi.fn() };
  const firstMessage: ServiceRequestMessage = {
    id: 101,
    content: 'Bonjour, serais-tu disponible samedi matin ?\nMerci !',
    createdAt: '2026-10-22T09:30:00.000Z',
    readAt: null,
    serviceRequestId: 42,
    authorUserId: 8,
    author: { id: 8, firstName: 'Alice', lastName: 'Martin' },
  };

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    unreadStoreStub.refresh.mockReset();
    response$ = new Subject<ServiceRequestMessage[]>();
    storeStub.getMessages.mockReset().mockReturnValue(response$);
    storeStub.sendMessage.mockReset();
    storeStub.markMessagesAsRead.mockReset().mockReturnValue(of(undefined));
    authSessionStub.currentUser.mockReset().mockReturnValue(null);
    await TestBed.configureTestingModule({
      imports: [ServiceRequestConversation],
      providers: [
        { provide: ServiceRequestStore, useValue: storeStub },
        { provide: AuthSession, useValue: authSessionStub },
        { provide: unreadMessageState, useValue: unreadStoreStub },
        { provide: DATE_PIPE_DEFAULT_OPTIONS, useValue: { timezone: 'UTC' } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ServiceRequestConversation);
    fixture.componentRef.setInput('serviceRequestId', 42);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    response$.complete();
  });

  it.each([42, 73])(
    'should load request %s only after its input is assigned and show the pending state',
    (serviceRequestId) => {
      fixture.componentRef.setInput('serviceRequestId', serviceRequestId);
      component.loadError.set('Ancienne erreur');
      expect(storeStub.getMessages).not.toHaveBeenCalled();

      fixture.detectChanges();

      expect(storeStub.getMessages).toHaveBeenCalledExactlyOnceWith(serviceRequestId);
      expect(component.isLoading()).toBe(true);
      expect(component.loadError()).toBeNull();
      expect(element().querySelector('[role="status"]')?.textContent).toContain(
        'Chargement de la conversation...',
      );
      expect(element().querySelector('[role="alert"]')).toBeNull();
      expect(element().querySelector('.conversation-messages')).toBeNull();
      expect(element().querySelector('form')).toBeNull();
      fixture.detectChanges();
      expect(storeStub.getMessages).toHaveBeenCalledTimes(1);
    },
  );

  it('should replace the loading state with messages, authors and formatted dates in server order', () => {
    const messages: ServiceRequestMessage[] = [
      firstMessage,
      {
        ...firstMessage,
        id: 102,
        content: 'Oui, à partir de 10 heures.',
        createdAt: '2026-10-22T09:35:00.000Z',
        readAt: '2026-10-22T09:36:00.000Z',
        authorUserId: 9,
        author: { id: 9, firstName: 'Bruno', lastName: 'Leroy' },
      },
    ];
    fixture.detectChanges();

    response$.next(messages);
    expect(component.messages()).toEqual(messages);
    expect(component.isLoading()).toBe(true);
    response$.complete();
    fixture.detectChanges();

    expect(component.isLoading()).toBe(false);
    expect(element().querySelector('[role="status"]')).toBeNull();
    expect(element().querySelector('[role="alert"]')).toBeNull();
    expect(element().querySelector('section')?.getAttribute('aria-label')).toBe(
      'Discussion de la demande',
    );
    const articles = Array.from(element().querySelectorAll('.conversation-message'));
    expect(articles).toHaveLength(2);
    articles.forEach((article, index) => {
      expect(article.querySelector('strong')?.textContent?.trim()).toBe(
        `${messages[index].author.firstName} ${messages[index].author.lastName}`,
      );
      expect(article.querySelector('.conversation-message-content')?.textContent?.trim()).toBe(
        messages[index].content,
      );
      expect(article.querySelector('time')?.getAttribute('datetime')).toBe(
        messages[index].createdAt,
      );
    });
    expect(articles[0].querySelector('time')?.textContent?.trim()).toBe('22/10/2026 à 09:30');
    expect(articles[1].querySelector('time')?.textContent).toContain('22/10/2026 à 09:35');
  });

  it('should show the empty conversation message only after an empty successful response', () => {
    fixture.detectChanges();
    expect(element().textContent).not.toContain('Aucun message dans cette discussion');

    response$.next([]);
    response$.complete();
    fixture.detectChanges();

    expect(component.isLoading()).toBe(false);
    expect(component.messages()).toEqual([]);
    expect(element().textContent).toContain('Aucun message dans cette discussion pour le moment.');
    expect(element().querySelector('.conversation-message')).toBeNull();
    expect(element().querySelector('[role="alert"]')).toBeNull();
  });

  it.each([401, 403, 404, 500])(
    'should replace loading with an error alert rather than an empty conversation after HTTP %s',
    (status) => {
      fixture.detectChanges();

      response$.error(new HttpErrorResponse({ status }));
      fixture.detectChanges();

      expect(component.isLoading()).toBe(false);
      expect(component.loadError()).toBe(
        'Impossible de charger la conversation. Veuillez réessayer.',
      );
      expect(element().querySelector('[role="status"]')).toBeNull();
      const alert = element().querySelector('[role="alert"]');
      expect(alert?.classList.contains('error-message')).toBe(true);
      expect(alert?.textContent).toContain(component.loadError());
      expect(element().querySelector('.conversation-messages')).toBeNull();
      expect(element().querySelector('form')).toBeNull();
      expect(element().textContent).not.toContain('Aucun message dans cette discussion');
    },
  );

  it('should render message content as text without interpreting supplied HTML', () => {
    const content = '<img src="invalid" onerror="alert(1)"> Bonjour';
    fixture.detectChanges();

    response$.next([{ ...firstMessage, content }]);
    response$.complete();
    fixture.detectChanges();

    const paragraph = element().querySelector('.conversation-message-content');
    expect(paragraph?.textContent?.trim()).toBe(content);
    expect(paragraph?.querySelector('img')).toBeNull();
  });

  describe('sending a reply', () => {
    const errorMessage = 'Impossible d’envoyer votre message. Veuillez réessayer.';

    beforeEach(() => {
      fixture.detectChanges();
      response$.next([firstMessage]);
      response$.complete();
      fixture.detectChanges();
    });

    it.each([
      { label: 'an empty message', content: '' },
      { label: 'a whitespace-only message', content: ' \t\n ' },
      { label: 'more than 2000 characters', content: 'x'.repeat(2001) },
    ])('should mark $label as touched without sending or changing history', ({ content }) => {
      const history = component.messages();
      component.messageForm.controls.content.setValue(content);

      component.onSendMessage();

      expect(component.messageForm.controls.content.touched).toBe(true);
      expect(component.messageForm.invalid).toBe(true);
      expect(component.messageForm.getRawValue()).toEqual({ content });
      expect(storeStub.sendMessage).not.toHaveBeenCalled();
      expect(component.messages()).toBe(history);
      expect(component.isSending()).toBe(false);
    });

    it('should wait for the saved reply, ignore duplicate sends, append it and reset the draft on success', () => {
      const sendResponse$ = new Subject<ServiceRequestMessage>();
      const prefix = 'Réponse de démonstration.\n';
      const content = prefix + 'x'.repeat(2000 - prefix.length);
      expect(content.length).toBe(2000);
      const savedMessage = {
        ...firstMessage,
        id: 102,
        content,
        createdAt: '2026-10-22T09:35:00.000Z',
      };
      const history = component.messages();
      storeStub.sendMessage.mockReturnValue(sendResponse$);
      component.messageForm.controls.content.setValue(content);
      component.messageForm.markAllAsTouched();
      component.sendError.set('Ancienne erreur');

      component.onSendMessage();
      component.onSendMessage();

      expect(storeStub.sendMessage).toHaveBeenCalledExactlyOnceWith(42, { content });
      expect(component.isSending()).toBe(true);
      expect(component.sendError()).toBeNull();
      expect(component.messages()).toBe(history);
      expect(component.messageForm.controls.content.value).toBe(content);
      sendResponse$.next(savedMessage);
      expect(component.messages()).toEqual([firstMessage, savedMessage]);
      expect(component.messages()).not.toBe(history);
      expect(history).toEqual([firstMessage]);
      expect(component.messageForm.getRawValue()).toEqual({ content: '' });
      expect(component.messageForm.untouched).toBe(true);
      expect(component.messageForm.pristine).toBe(true);
      expect(component.isSending()).toBe(true);
      sendResponse$.complete();
      expect(component.isSending()).toBe(false);
      fixture.detectChanges();
      expect(element().querySelectorAll('.conversation-message')).toHaveLength(2);
      expect(storeStub.getMessages).toHaveBeenCalledTimes(1);
    });

    it.each([401, 403, 500])(
      'should preserve the draft and history and stop sending after HTTP %s',
      (status) => {
        const sendResponse$ = new Subject<ServiceRequestMessage>();
        const history = component.messages();
        const content = '  Bonjour, samedi matin ?\nMerci !  ';
        storeStub.sendMessage.mockReturnValue(sendResponse$);
        component.messageForm.controls.content.setValue(content);
        component.onSendMessage();

        sendResponse$.error(new HttpErrorResponse({ status }));
        fixture.detectChanges();

        expect(component.isSending()).toBe(false);
        expect(component.sendError()).toBe(errorMessage);
        expect(component.messageForm.getRawValue()).toEqual({ content });
        expect(component.messages()).toBe(history);
        expect(component.loadError()).toBeNull();
        expect(element().querySelectorAll('.conversation-message')).toHaveLength(1);
      },
    );

    it('should allow retrying the preserved draft and clear its previous sending error', () => {
      const firstSend$ = new Subject<ServiceRequestMessage>();
      const secondSend$ = new Subject<ServiceRequestMessage>();
      const content = 'Merci, à samedi !';
      const savedMessage = { ...firstMessage, id: 102, content };
      storeStub.sendMessage.mockReturnValueOnce(firstSend$).mockReturnValueOnce(secondSend$);
      component.messageForm.controls.content.setValue(content);
      component.onSendMessage();
      firstSend$.error(new HttpErrorResponse({ status: 500 }));
      expect(component.sendError()).toBe(errorMessage);

      component.onSendMessage();

      expect(storeStub.sendMessage).toHaveBeenCalledTimes(2);
      expect(storeStub.sendMessage).toHaveBeenNthCalledWith(2, 42, { content });
      expect(component.sendError()).toBeNull();
      expect(component.isSending()).toBe(true);
      secondSend$.next(savedMessage);
      secondSend$.complete();
      expect(component.messages()).toEqual([firstMessage, savedMessage]);
      expect(component.messageForm.controls.content.value).toBe('');
      expect(component.isSending()).toBe(false);
    });
  });

  describe('reply form interactions', () => {
    beforeEach(() => {
      fixture.detectChanges();
      response$.next([firstMessage]);
      response$.complete();
      fixture.detectChanges();
    });

    function textarea(): HTMLTextAreaElement {
      return element().querySelector('textarea')!;
    }

    function submitButton(): HTMLButtonElement {
      return element().querySelector('button[type="submit"]')!;
    }

    function enterMessage(content: string): void {
      textarea().value = content;
      textarea().dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
    }

    function submit(): void {
      element()
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      fixture.detectChanges();
    }

    it('should label the reply field with a request-specific id and use Angular validation', () => {
      expect(textarea().id).toBe('reply-content-42');
      expect(textarea().labels?.[0]?.textContent?.trim()).toBe('Votre réponse');
      expect(textarea().rows).toBe(4);
      expect(textarea().maxLength).toBe(2000);
      expect(textarea().readOnly).toBe(false);
      expect(textarea().value).toBe('');
      expect(element().querySelector('form')!.noValidate).toBe(true);
      expect(submitButton().disabled).toBe(false);
      expect(element().querySelector('.field-error')).toBeNull();
      expect(element().querySelector('[role="alert"]')).toBeNull();
    });

    it.each(['', ' \t\n '])(
      'should reveal validation after submitting invalid content %j without sending',
      (content) => {
        enterMessage(content);
        expect(element().querySelector('.field-error')).toBeNull();

        submit();

        expect(component.messageForm.controls.content.touched).toBe(true);
        expect(element().querySelector('.field-error')?.textContent).toContain(
          'Écrivez un message contenant du texte, de 2 000 caractères maximum.',
        );
        expect(storeStub.sendMessage).not.toHaveBeenCalled();
        expect(submitButton().disabled).toBe(false);
        expect(element().querySelectorAll('.conversation-message')).toHaveLength(1);
      },
    );

    it('should reveal invalid content after blur and remove its validation error when corrected', () => {
      enterMessage('   ');
      expect(element().querySelector('.field-error')).toBeNull();

      textarea().dispatchEvent(new Event('blur'));
      fixture.detectChanges();
      expect(element().querySelector('.field-error')).not.toBeNull();
      enterMessage('Bonjour !');

      expect(element().querySelector('.field-error')).toBeNull();
      expect(storeStub.sendMessage).not.toHaveBeenCalled();
    });

    it('should lock the pending draft, prevent duplicate submission and display the saved reply on success', () => {
      const sendResponse$ = new Subject<ServiceRequestMessage>();
      const content = '  Bonjour !\nSamedi à 10 heures me convient.  ';
      const savedMessage = { ...firstMessage, id: 102, content };
      storeStub.sendMessage.mockReturnValue(sendResponse$);
      enterMessage(content);

      submit();

      expect(storeStub.sendMessage).toHaveBeenCalledExactlyOnceWith(42, { content });
      expect(textarea().readOnly).toBe(true);
      expect(textarea().value).toBe(content);
      expect(submitButton().disabled).toBe(true);
      expect(submitButton().textContent).toContain('Envoi en cours');
      expect(element().querySelectorAll('.conversation-message')).toHaveLength(1);
      submit();
      expect(storeStub.sendMessage).toHaveBeenCalledTimes(1);
      sendResponse$.next(savedMessage);
      sendResponse$.complete();
      fixture.detectChanges();

      expect(textarea().value).toBe('');
      expect(textarea().readOnly).toBe(false);
      expect(submitButton().disabled).toBe(false);
      expect(submitButton().textContent).toContain('Envoyer le message');
      const paragraphs = element().querySelectorAll('.conversation-message-content');
      expect(paragraphs).toHaveLength(2);
      expect(paragraphs[1].textContent).toContain(content);
      expect(element().querySelector('.field-error')).toBeNull();
      expect(element().querySelector('[role="alert"]')).toBeNull();
    });

    it('should display a sending error, preserve the draft and history, and allow retrying through the form', () => {
      const firstSend$ = new Subject<ServiceRequestMessage>();
      const secondSend$ = new Subject<ServiceRequestMessage>();
      const content = 'Merci pour ta réponse !';
      storeStub.sendMessage.mockReturnValueOnce(firstSend$).mockReturnValueOnce(secondSend$);
      enterMessage(content);
      submit();

      firstSend$.error(new HttpErrorResponse({ status: 500 }));
      fixture.detectChanges();

      const alert = element().querySelector('[role="alert"]');
      expect(alert?.classList.contains('error-message')).toBe(true);
      expect(alert?.textContent).toContain(
        'Impossible d’envoyer votre message. Veuillez réessayer.',
      );
      expect(textarea().value).toBe(content);
      expect(textarea().readOnly).toBe(false);
      expect(submitButton().disabled).toBe(false);
      expect(element().querySelectorAll('.conversation-message')).toHaveLength(1);
      submit();
      expect(element().querySelector('[role="alert"]')).toBeNull();
      expect(storeStub.sendMessage).toHaveBeenCalledTimes(2);
      secondSend$.next({ ...firstMessage, id: 102, content });
      secondSend$.complete();
      fixture.detectChanges();
      expect(textarea().value).toBe('');
      expect(element().querySelectorAll('.conversation-message')).toHaveLength(2);
    });

    it('should allow sending the first reply in an empty conversation', () => {
      const sendResponse$ = new Subject<ServiceRequestMessage>();
      component.messages.set([]);
      fixture.detectChanges();
      expect(element().textContent).toContain(
        'Aucun message dans cette discussion pour le moment.',
      );
      const content = 'Bonjour, voici mon premier message.';
      storeStub.sendMessage.mockReturnValue(sendResponse$);
      enterMessage(content);

      submit();
      sendResponse$.next({ ...firstMessage, content });
      sendResponse$.complete();
      fixture.detectChanges();

      expect(element().textContent).not.toContain(
        'Aucun message dans cette discussion pour le moment.',
      );
      expect(element().querySelectorAll('.conversation-message')).toHaveLength(1);
      expect(element().querySelector('.conversation-message-content')?.textContent).toContain(
        content,
      );
      expect(element().querySelector('form')).not.toBeNull();
    });
  });

  describe('closing while a request is pending', () => {
    it.each(['success', 'error'] as const)(
      'should unsubscribe from loading on destruction and ignore a late %s',
      (outcome) => {
        const teardown = vi.fn();
        storeStub.getMessages.mockReturnValue(response$.pipe(finalize(teardown)));
        fixture.detectChanges();
        expect(component.isLoading()).toBe(true);
        expect(teardown).not.toHaveBeenCalled();

        fixture.destroy();

        expect(teardown).toHaveBeenCalledTimes(1);
        expect(component.isLoading()).toBe(false);
        if (outcome === 'success') {
          response$.next([firstMessage]);
          response$.complete();
        } else {
          response$.error(new HttpErrorResponse({ status: 500 }));
        }
        expect(component.messages()).toEqual([]);
        expect(component.loadError()).toBeNull();
        expect(teardown).toHaveBeenCalledTimes(1);
      },
    );

    it.each(['success', 'error'] as const)(
      'should unsubscribe from sending on destruction and ignore a late %s without resetting the draft',
      (outcome) => {
        const sendResponse$ = new Subject<ServiceRequestMessage>();
        const teardown = vi.fn();
        const content = 'Brouillon en cours d’envoi.';
        fixture.detectChanges();
        response$.next([firstMessage]);
        response$.complete();
        storeStub.sendMessage.mockReturnValue(sendResponse$.pipe(finalize(teardown)));
        component.messageForm.controls.content.setValue(content);
        const history = component.messages();
        component.onSendMessage();
        expect(component.isSending()).toBe(true);
        expect(teardown).not.toHaveBeenCalled();

        fixture.destroy();

        expect(teardown).toHaveBeenCalledTimes(1);
        expect(component.isSending()).toBe(false);
        if (outcome === 'success') {
          sendResponse$.next({ ...firstMessage, id: 102, content });
          sendResponse$.complete();
        } else {
          sendResponse$.error(new HttpErrorResponse({ status: 500 }));
        }
        expect(component.messages()).toBe(history);
        expect(component.messages()).toEqual([firstMessage]);
        expect(component.messageForm.getRawValue()).toEqual({ content });
        expect(component.sendError()).toBeNull();
        expect(teardown).toHaveBeenCalledTimes(1);
      },
    );
  });

  describe('marking received messages as read', () => {
    it('should refresh shared counts only when the read update succeeds', () => {
      authSessionStub.currentUser.mockReturnValue({ id: 9 });
      const readResponse$ = new Subject<void>();
      storeStub.markMessagesAsRead.mockReturnValue(readResponse$);

      component.markReceivedMessagesAsRead([firstMessage]);

      expect(unreadStoreStub.refresh).not.toHaveBeenCalled();
      readResponse$.next(undefined);
      expect(unreadStoreStub.refresh).toHaveBeenCalledTimes(1);
      readResponse$.complete();
      expect(unreadStoreStub.refresh).toHaveBeenCalledTimes(1);
    });

    it('should not refresh counts when a read update completes without acknowledgement', () => {
      authSessionStub.currentUser.mockReturnValue({ id: 9 });
      const readResponse$ = new Subject<void>();
      storeStub.markMessagesAsRead.mockReturnValue(readResponse$);
      component.markReceivedMessagesAsRead([firstMessage]);

      readResponse$.complete();

      expect(unreadStoreStub.refresh).not.toHaveBeenCalled();
    });

    it('should not refresh counts after closing before a successful read acknowledgement arrives', () => {
      authSessionStub.currentUser.mockReturnValue({ id: 9 });
      const readResponse$ = new Subject<void>();
      const teardown = vi.fn();
      storeStub.markMessagesAsRead.mockReturnValue(readResponse$.pipe(finalize(teardown)));
      component.markReceivedMessagesAsRead([firstMessage]);

      fixture.destroy();
      readResponse$.next(undefined);
      readResponse$.complete();

      expect(teardown).toHaveBeenCalledTimes(1);
      expect(unreadStoreStub.refresh).not.toHaveBeenCalled();
    });

    it('should not mark messages without an authenticated user', () => {
      component.markReceivedMessagesAsRead([firstMessage]);

      expect(storeStub.markMessagesAsRead).not.toHaveBeenCalled();
      expect(unreadStoreStub.refresh).not.toHaveBeenCalled();
    });

    it.each([
      { label: 'an empty conversation', messages: [] },
      { label: 'only own unread messages', messages: [firstMessage] },
      {
        label: 'only already-read received messages',
        messages: [{ ...firstMessage, authorUserId: 9, readAt: '2026-10-23T07:30:00.000Z' }],
      },
    ])('should skip $label', ({ messages }) => {
      authSessionStub.currentUser.mockReturnValue({ id: 8 });

      component.markReceivedMessagesAsRead(messages);

      expect(storeStub.markMessagesAsRead).not.toHaveBeenCalled();
      expect(unreadStoreStub.refresh).not.toHaveBeenCalled();
    });

    it.each([8, 9])(
      'should mark received unread messages for participant %s and clear the previous read error',
      (userId) => {
        authSessionStub.currentUser.mockReturnValue({ id: userId });
        const received = { ...firstMessage, authorUserId: userId === 8 ? 9 : 8 };
        component.readError.set('Ancienne erreur');

        component.markReceivedMessagesAsRead([received]);

        expect(storeStub.markMessagesAsRead).toHaveBeenCalledExactlyOnceWith(42, {
          upToMessageId: 101,
        });
        expect(component.readError()).toBeNull();
        expect(received.readAt).toBeNull();
        expect(unreadStoreStub.refresh).toHaveBeenCalledTimes(1);
      },
    );

    it('should use the highest displayed id rather than the last or highest unread received id', () => {
      authSessionStub.currentUser.mockReturnValue({ id: 8 });
      const messages = [
        { ...firstMessage, id: 105, authorUserId: 9, createdAt: '2026-10-23T07:30:00.000Z' },
        { ...firstMessage, id: 109, createdAt: '2026-10-23T07:31:00.000Z' },
        { ...firstMessage, id: 103, authorUserId: 9, createdAt: '2026-10-23T07:32:00.000Z' },
      ];
      const snapshot = structuredClone(messages);

      component.markReceivedMessagesAsRead(messages);

      expect(storeStub.markMessagesAsRead).toHaveBeenCalledExactlyOnceWith(42, {
        upToMessageId: 109,
      });
      expect(messages).toEqual(snapshot);
    });

    it('should report a read failure separately without hiding messages or changing the draft', () => {
      authSessionStub.currentUser.mockReturnValue({ id: 9 });
      const readResponse$ = new Subject<void>();
      storeStub.markMessagesAsRead.mockReturnValue(readResponse$);
      fixture.detectChanges();
      response$.next([firstMessage]);
      response$.complete();
      fixture.detectChanges();
      component.messageForm.controls.content.setValue('Brouillon conservé.');
      const history = component.messages();
      expect(storeStub.markMessagesAsRead).toHaveBeenCalledExactlyOnceWith(42, {
        upToMessageId: 101,
      });

      readResponse$.error(new HttpErrorResponse({ status: 500 }));
      fixture.detectChanges();

      expect(component.readError()).toBe('Impossible de marquer les messages comme lus');
      expect(unreadStoreStub.refresh).not.toHaveBeenCalled();
      expect(component.loadError()).toBeNull();
      expect(component.sendError()).toBeNull();
      expect(component.messages()).toBe(history);
      expect(component.messageForm.controls.content.value).toBe('Brouillon conservé.');
      expect(element().querySelectorAll('.conversation-message')).toHaveLength(1);
      expect(element().querySelector('form')).not.toBeNull();
    });

    it('should unsubscribe a pending read update on destruction and ignore its late error', () => {
      authSessionStub.currentUser.mockReturnValue({ id: 9 });
      const readResponse$ = new Subject<void>();
      const teardown = vi.fn();
      storeStub.markMessagesAsRead.mockReturnValue(readResponse$.pipe(finalize(teardown)));
      component.markReceivedMessagesAsRead([firstMessage]);
      expect(teardown).not.toHaveBeenCalled();

      fixture.destroy();

      expect(teardown).toHaveBeenCalledTimes(1);
      readResponse$.error(new HttpErrorResponse({ status: 500 }));
      expect(component.readError()).toBeNull();
    });
  });

  describe('periodic history refresh', () => {
    let visibility: DocumentVisibilityState;
    const otherMessage: ServiceRequestMessage = {
      ...firstMessage,
      id: 102,
      content: 'Oui, samedi matin me convient.',
      createdAt: '2026-10-24T09:30:00.000Z',
      authorUserId: 9,
      author: { id: 9, firstName: 'Bruno', lastName: 'Leroy' },
    };

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      visibility = 'visible';
      vi.spyOn(TestBed.inject(DOCUMENT), 'visibilityState', 'get').mockImplementation(
        () => visibility,
      );
      authSessionStub.currentUser.mockReturnValue({ id: 8 });
    });

    afterEach(() => {
      fixture.destroy();
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    function loadInitial(messages: ServiceRequestMessage[] = [firstMessage]) {
      fixture.detectChanges();
      response$.next(messages);
      response$.complete();
      fixture.detectChanges();
    }

    function nextRefresh() {
      const response = new Subject<ServiceRequestMessage[]>();
      storeStub.getMessages.mockReturnValue(response);
      vi.advanceTimersByTime(10_000);
      return response;
    }

    it('should refresh after 10 seconds while keeping the same focused reply field and draft', () => {
      loadInitial();
      const textarea = element().querySelector<HTMLTextAreaElement>('textarea')!;
      textarea.value = 'Mon brouillon en cours';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.focus();
      textarea.setSelectionRange(4, 12);
      fixture.detectChanges();
      const form = element().querySelector('form');
      const initialArticle = element().querySelector('.conversation-message');
      const refresh$ = new Subject<ServiceRequestMessage[]>();
      storeStub.getMessages.mockReturnValue(refresh$);
      vi.advanceTimersByTime(9_999);
      expect(storeStub.getMessages).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(1);
      fixture.detectChanges();

      expect(storeStub.getMessages).toHaveBeenLastCalledWith(42);
      expect(storeStub.getMessages).toHaveBeenCalledTimes(2);
      expect(component.isLoading()).toBe(false);
      expect(component.isRefreshing()).toBe(true);
      expect(element().querySelector('[role="status"]')).toBeNull();
      expect(element().querySelector('form')).toBe(form);
      expect(element().querySelector('textarea')).toBe(textarea);
      expect(TestBed.inject(DOCUMENT).activeElement).toBe(textarea);
      const readAt = '2026-10-24T09:35:00.000Z';
      refresh$.next([
        { ...firstMessage, readAt },
        { ...otherMessage, readAt },
      ]);
      refresh$.complete();
      fixture.detectChanges();
      expect(component.isRefreshing()).toBe(false);
      expect(element().querySelectorAll('.conversation-message')).toHaveLength(2);
      expect(element().querySelector('.conversation-message')).toBe(initialArticle);
      expect(element().querySelectorAll('.message-read-check')).toHaveLength(2);
      expect(element().querySelector('textarea')).toBe(textarea);
      expect(textarea.value).toBe('Mon brouillon en cours');
      expect(textarea.selectionStart).toBe(4);
      expect(textarea.selectionEnd).toBe(12);
      expect(TestBed.inject(DOCUMENT).activeElement).toBe(textarea);
      expect(component.messageForm.dirty).toBe(true);
      expect(storeStub.markMessagesAsRead).not.toHaveBeenCalled();
    });

    it('should wait for a slow initial load instead of starting background loads', () => {
      fixture.detectChanges();

      vi.advanceTimersByTime(30_000);

      expect(storeStub.getMessages).toHaveBeenCalledTimes(1);
      expect(component.isLoading()).toBe(true);
      expect(component.isRefreshing()).toBe(false);
      response$.next([firstMessage]);
      response$.complete();
      fixture.detectChanges();
      storeStub.getMessages.mockReturnValue(of([firstMessage]));
      vi.advanceTimersByTime(10_000);
      fixture.detectChanges();
      expect(storeStub.getMessages).toHaveBeenCalledTimes(2);
    });

    it('should skip ticks while a background load is pending and accept the following tick after completion', () => {
      loadInitial();
      const refresh$ = new Subject<ServiceRequestMessage[]>();
      const teardown = vi.fn();
      storeStub.getMessages.mockReturnValue(refresh$.pipe(finalize(teardown)));
      vi.advanceTimersByTime(10_000);

      vi.advanceTimersByTime(30_000);

      expect(storeStub.getMessages).toHaveBeenCalledTimes(2);
      expect(teardown).not.toHaveBeenCalled();
      expect(component.isRefreshing()).toBe(true);
      refresh$.next([firstMessage]);
      refresh$.complete();
      expect(teardown).toHaveBeenCalledTimes(1);
      storeStub.getMessages.mockReturnValue(of([firstMessage]));
      vi.advanceTimersByTime(10_000);
      fixture.detectChanges();
      expect(storeStub.getMessages).toHaveBeenCalledTimes(3);
    });

    it('should refresh immediately on return without changing the periodic schedule', () => {
      loadInitial();
      visibility = 'hidden';
      TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(35_000);
      expect(storeStub.getMessages).toHaveBeenCalledTimes(1);
      const refresh$ = new Subject<ServiceRequestMessage[]>();
      storeStub.getMessages.mockReturnValue(refresh$);

      visibility = 'visible';
      TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));

      expect(storeStub.getMessages).toHaveBeenCalledTimes(2);
      expect(storeStub.getMessages).toHaveBeenLastCalledWith(42);
      refresh$.next([firstMessage]);
      refresh$.complete();
      fixture.detectChanges();
      storeStub.getMessages.mockReturnValue(of([firstMessage]));
      vi.advanceTimersByTime(4_999);
      expect(storeStub.getMessages).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(1);
      fixture.detectChanges();
      expect(storeStub.getMessages).toHaveBeenCalledTimes(3);
    });

    it('should ignore visibility changes while the initial history request is still pending', () => {
      const teardown = vi.fn();
      storeStub.getMessages.mockReturnValue(response$.pipe(finalize(teardown)));
      fixture.detectChanges();

      visibility = 'hidden';
      TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
      visibility = 'visible';
      TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));

      expect(storeStub.getMessages).toHaveBeenCalledTimes(1);
      expect(teardown).not.toHaveBeenCalled();
      expect(component.isLoading()).toBe(true);
      response$.next([firstMessage]);
      response$.complete();
      fixture.detectChanges();
      expect(teardown).toHaveBeenCalledTimes(1);
      expect(component.isLoading()).toBe(false);
    });

    it('should preserve the draft and wait for a return-triggered request across further events and timer ticks', () => {
      loadInitial();
      const textarea = element().querySelector<HTMLTextAreaElement>('textarea')!;
      textarea.value = 'Brouillon au retour';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.focus();
      fixture.detectChanges();
      const refresh$ = new Subject<ServiceRequestMessage[]>();
      const teardown = vi.fn();
      storeStub.getMessages.mockReturnValue(refresh$.pipe(finalize(teardown)));
      visibility = 'hidden';
      TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
      visibility = 'visible';
      TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
      expect(storeStub.getMessages).toHaveBeenCalledTimes(2);

      visibility = 'hidden';
      TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
      visibility = 'visible';
      TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(20_000);
      fixture.detectChanges();

      expect(storeStub.getMessages).toHaveBeenCalledTimes(2);
      expect(teardown).not.toHaveBeenCalled();
      expect(component.isRefreshing()).toBe(true);
      expect(element().querySelector('textarea')).toBe(textarea);
      expect(TestBed.inject(DOCUMENT).activeElement).toBe(textarea);
      expect(textarea.value).toBe('Brouillon au retour');
      refresh$.next([firstMessage]);
      refresh$.complete();
      fixture.detectChanges();
      expect(teardown).toHaveBeenCalledTimes(1);
      expect(component.messageForm.controls.content.value).toBe('Brouillon au retour');
    });

    it('should defer visibility-triggered loading while sending and allow it again after the saved reply', () => {
      loadInitial();
      const send$ = new Subject<ServiceRequestMessage>();
      storeStub.sendMessage.mockReturnValue(send$);
      const saved = { ...firstMessage, id: 103, content: 'Ma réponse' };
      component.messageForm.controls.content.setValue(saved.content);
      component.onSendMessage();
      visibility = 'hidden';
      TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
      visibility = 'visible';
      TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(10_000);
      expect(storeStub.getMessages).toHaveBeenCalledTimes(1);

      send$.next(saved);
      send$.complete();
      storeStub.getMessages.mockReturnValue(of([firstMessage, saved]));
      visibility = 'hidden';
      TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
      visibility = 'visible';
      TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
      fixture.detectChanges();

      expect(storeStub.getMessages).toHaveBeenCalledTimes(2);
      expect(component.messages()).toEqual([firstMessage, saved]);
      expect(component.isSending()).toBe(false);
    });

    it('should retry a failed return-triggered refresh on another return while keeping the draft', () => {
      loadInitial();
      component.messageForm.controls.content.setValue('Brouillon conservé');
      const failed$ = new Subject<ServiceRequestMessage[]>();
      const retry$ = new Subject<ServiceRequestMessage[]>();
      storeStub.getMessages.mockReturnValueOnce(failed$).mockReturnValueOnce(retry$);
      visibility = 'hidden';
      TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
      visibility = 'visible';
      TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
      expect(storeStub.getMessages).toHaveBeenCalledTimes(2);
      failed$.error(new HttpErrorResponse({ status: 500 }));
      fixture.detectChanges();
      expect(component.refreshError()).not.toBeNull();
      expect(element().querySelector('textarea')?.value).toBe('Brouillon conservé');

      visibility = 'hidden';
      TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
      visibility = 'visible';
      TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
      fixture.detectChanges();

      expect(storeStub.getMessages).toHaveBeenCalledTimes(3);
      expect(component.refreshError()).toBeNull();
      retry$.next([firstMessage]);
      retry$.complete();
      fixture.detectChanges();
      expect(component.isRefreshing()).toBe(false);
      expect(component.messageForm.controls.content.value).toBe('Brouillon conservé');
    });

    it('should remove the visibility listener and stop both refresh sources on closure', () => {
      const document = TestBed.inject(DOCUMENT);
      const addListener = vi.spyOn(document, 'addEventListener');
      const removeListener = vi.spyOn(document, 'removeEventListener');
      loadInitial();
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
      vi.advanceTimersByTime(30_000);
      expect(storeStub.getMessages).toHaveBeenCalledTimes(1);
    });

    it('should not issue further history requests when the session becomes anonymous', () => {
      loadInitial();
      authSessionStub.currentUser.mockReturnValue(null);

      visibility = 'hidden';
      TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
      visibility = 'visible';
      TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(30_000);

      expect(storeStub.getMessages).toHaveBeenCalledTimes(1);
    });

    it('should retain the initial loading error without automatically retrying in the background', () => {
      fixture.detectChanges();
      response$.error(new HttpErrorResponse({ status: 500 }));
      fixture.detectChanges();

      visibility = 'hidden';
      TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
      visibility = 'visible';
      TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(30_000);

      expect(storeStub.getMessages).toHaveBeenCalledTimes(1);
      expect(component.loadError()).toBe(
        'Impossible de charger la conversation. Veuillez réessayer.',
      );
      expect(component.refreshError()).toBeNull();
      expect(element().querySelector('form')).toBeNull();
    });

    it('should preserve history and the draft after a refresh error and clear the alert on the next attempt', () => {
      loadInitial();
      component.messageForm.controls.content.setValue('Brouillon conservé');
      const form = element().querySelector('form');
      const history = component.messages();
      const refresh$ = nextRefresh();

      refresh$.error(new HttpErrorResponse({ status: 500 }));
      fixture.detectChanges();

      expect(component.loadError()).toBeNull();
      expect(component.isRefreshing()).toBe(false);
      expect(component.messages()).toBe(history);
      expect(element().querySelector('form')).toBe(form);
      expect(element().querySelector('textarea')?.value).toBe('Brouillon conservé');
      expect(element().querySelector('[role="alert"]')?.textContent).toContain(
        'Impossible d’actualiser la conversation. Les messages affichés sont conservés.',
      );
      const retry$ = nextRefresh();
      fixture.detectChanges();
      expect(component.refreshError()).toBeNull();
      expect(element().querySelector('[role="alert"]')).toBeNull();
      expect(component.isRefreshing()).toBe(true);
      retry$.next([firstMessage]);
      retry$.complete();
      fixture.detectChanges();
      expect(component.isRefreshing()).toBe(false);
      expect(component.messageForm.controls.content.value).toBe('Brouillon conservé');
    });

    it('should populate an initially empty conversation at a later polling tick', () => {
      loadInitial([]);
      expect(element().textContent).toContain('Aucun message dans cette discussion');
      const refresh$ = nextRefresh();

      refresh$.next([firstMessage]);
      refresh$.complete();
      fixture.detectChanges();

      expect(element().querySelectorAll('.conversation-message')).toHaveLength(1);
      expect(element().textContent).not.toContain('Aucun message dans cette discussion');
      expect(element().querySelector('form')).not.toBeNull();
    });

    it('should mark new received replies only after refreshed history is rendered and refresh counts after acknowledgement', () => {
      loadInitial();
      const read$ = new Subject<void>();
      storeStub.markMessagesAsRead.mockReturnValue(read$);
      const refresh$ = nextRefresh();
      refresh$.next([firstMessage, otherMessage]);
      refresh$.complete();
      expect(storeStub.markMessagesAsRead).not.toHaveBeenCalled();

      fixture.detectChanges();

      expect(element().querySelectorAll('.conversation-message')).toHaveLength(2);
      expect(storeStub.markMessagesAsRead).toHaveBeenCalledExactlyOnceWith(42, {
        upToMessageId: 102,
      });
      expect(unreadStoreStub.refresh).not.toHaveBeenCalled();
      read$.next(undefined);
      read$.complete();
      expect(unreadStoreStub.refresh).toHaveBeenCalledTimes(1);
      fixture.detectChanges();
      expect(storeStub.markMessagesAsRead).toHaveBeenCalledTimes(1);
    });

    it('should not mark a refreshed response while hidden and should mark it after a later visible load', () => {
      loadInitial();
      const refresh$ = nextRefresh();
      refresh$.next([firstMessage, otherMessage]);
      refresh$.complete();
      visibility = 'hidden';

      fixture.detectChanges();

      expect(storeStub.markMessagesAsRead).not.toHaveBeenCalled();
      expect(unreadStoreStub.refresh).not.toHaveBeenCalled();
      visibility = 'visible';
      storeStub.getMessages.mockReturnValue(of([firstMessage, otherMessage]));
      vi.advanceTimersByTime(10_000);
      fixture.detectChanges();
      expect(storeStub.markMessagesAsRead).toHaveBeenCalledExactlyOnceWith(42, {
        upToMessageId: 102,
      });
    });

    it.each(['success', 'error'] as const)(
      'should cancel a pending refresh and stop polling on closure while ignoring its late %s',
      (outcome) => {
        loadInitial();
        component.messageForm.controls.content.setValue('Brouillon');
        const history = component.messages();
        const refresh$ = new Subject<ServiceRequestMessage[]>();
        const teardown = vi.fn();
        storeStub.getMessages.mockReturnValue(refresh$.pipe(finalize(teardown)));
        vi.advanceTimersByTime(10_000);
        expect(component.isRefreshing()).toBe(true);

        fixture.destroy();
        if (outcome === 'success') {
          refresh$.next([firstMessage, otherMessage]);
          refresh$.complete();
        } else {
          refresh$.error(new HttpErrorResponse({ status: 500 }));
        }
        vi.advanceTimersByTime(30_000);

        expect(teardown).toHaveBeenCalledTimes(1);
        expect(component.isRefreshing()).toBe(false);
        expect(component.messages()).toBe(history);
        expect(component.refreshError()).toBeNull();
        expect(component.messageForm.controls.content.value).toBe('Brouillon');
        expect(storeStub.getMessages).toHaveBeenCalledTimes(2);
        expect(storeStub.markMessagesAsRead).not.toHaveBeenCalled();
      },
    );

    it.each(['success', 'error'] as const)(
      'should cancel an older refresh before sending and ignore its late %s without losing the saved reply',
      (outcome) => {
        loadInitial();
        const refresh$ = new Subject<ServiceRequestMessage[]>();
        const teardown = vi.fn();
        storeStub.getMessages.mockReturnValue(refresh$.pipe(finalize(teardown)));
        vi.advanceTimersByTime(10_000);
        const send$ = new Subject<ServiceRequestMessage>();
        storeStub.sendMessage.mockReturnValue(send$);
        const saved = { ...firstMessage, id: 103, content: 'Ma nouvelle réponse' };
        component.messageForm.controls.content.setValue(saved.content);

        component.onSendMessage();

        expect(teardown).toHaveBeenCalledTimes(1);
        expect(component.isRefreshing()).toBe(false);
        expect(component.isSending()).toBe(true);
        expect(storeStub.sendMessage).toHaveBeenCalledExactlyOnceWith(42, {
          content: saved.content,
        });
        vi.advanceTimersByTime(20_000);
        expect(storeStub.getMessages).toHaveBeenCalledTimes(2);
        send$.next(saved);
        send$.complete();
        if (outcome === 'success') {
          refresh$.next([firstMessage]);
          refresh$.complete();
        } else {
          refresh$.error(new HttpErrorResponse({ status: 500 }));
        }
        fixture.detectChanges();
        expect(component.messages()).toEqual([firstMessage, saved]);
        expect(component.messageForm.controls.content.value).toBe('');
        expect(component.refreshError()).toBeNull();
        storeStub.getMessages.mockReturnValue(of([firstMessage, saved]));
        vi.advanceTimersByTime(10_000);
        fixture.detectChanges();
        expect(storeStub.getMessages).toHaveBeenCalledTimes(3);
        expect(component.messages()).toEqual([firstMessage, saved]);
      },
    );

    it('should leave a pending refresh active when submission is invalid', () => {
      loadInitial();
      const refresh$ = new Subject<ServiceRequestMessage[]>();
      const teardown = vi.fn();
      storeStub.getMessages.mockReturnValue(refresh$.pipe(finalize(teardown)));
      vi.advanceTimersByTime(10_000);
      component.messageForm.controls.content.setValue('   ');

      component.onSendMessage();

      expect(teardown).not.toHaveBeenCalled();
      expect(component.isRefreshing()).toBe(true);
      expect(component.messageForm.controls.content.touched).toBe(true);
      expect(storeStub.sendMessage).not.toHaveBeenCalled();
      refresh$.next([firstMessage]);
      refresh$.complete();
      fixture.detectChanges();
      expect(teardown).toHaveBeenCalledTimes(1);
      expect(component.messageForm.controls.content.value).toBe('   ');
    });

    it('should resume history refresh after a cancelled load and failed send without clearing the draft', () => {
      loadInitial();
      const refresh$ = nextRefresh();
      const send$ = new Subject<ServiceRequestMessage>();
      storeStub.sendMessage.mockReturnValue(send$);
      component.messageForm.controls.content.setValue('Brouillon à réessayer');
      component.onSendMessage();

      send$.error(new HttpErrorResponse({ status: 500 }));
      fixture.detectChanges();
      expect(component.isSending()).toBe(false);
      expect(component.messageForm.controls.content.value).toBe('Brouillon à réessayer');
      expect(component.sendError()).not.toBeNull();
      storeStub.getMessages.mockReturnValue(of([firstMessage]));
      vi.advanceTimersByTime(10_000);
      fixture.detectChanges();
      expect(storeStub.getMessages).toHaveBeenCalledTimes(3);
      expect(component.messageForm.controls.content.value).toBe('Brouillon à réessayer');
      refresh$.next([]);
      expect(component.messages()).toEqual([firstMessage]);
    });
  });

  describe('read receipts after rendering', () => {
    beforeEach(() => {
      authSessionStub.currentUser.mockReturnValue({ id: 9 });
    });

    it('should mark only after the loaded history is rendered and not repeat on later renders', () => {
      const messages = [
        firstMessage,
        {
          ...firstMessage,
          id: 105,
          authorUserId: 9,
          author: { id: 9, firstName: 'Bruno', lastName: 'Leroy' },
        },
      ];
      storeStub.markMessagesAsRead.mockImplementation(() => {
        expect(element().querySelectorAll('.conversation-message')).toHaveLength(2);
        expect(element().querySelector('[role="status"]')).toBeNull();
        expect(element().querySelector('form')).not.toBeNull();
        return of(undefined);
      });
      fixture.detectChanges();
      expect(storeStub.markMessagesAsRead).not.toHaveBeenCalled();
      expect(unreadStoreStub.refresh).not.toHaveBeenCalled();

      response$.next(messages);
      response$.complete();
      expect(component.isLoading()).toBe(false);
      expect(element().querySelectorAll('.conversation-message')).toHaveLength(0);
      expect(storeStub.markMessagesAsRead).not.toHaveBeenCalled();
      expect(unreadStoreStub.refresh).not.toHaveBeenCalled();
      fixture.detectChanges();

      expect(storeStub.markMessagesAsRead).toHaveBeenCalledExactlyOnceWith(42, {
        upToMessageId: 105,
      });
      const textarea = element().querySelector('textarea')!;
      textarea.value = 'Brouillon en cours';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
      fixture.detectChanges();
      expect(storeStub.markMessagesAsRead).toHaveBeenCalledTimes(1);
      expect(component.messages()).toEqual(messages);
      expect(component.readError()).toBeNull();
    });

    it.each([
      { label: 'an empty history', messages: [] },
      { label: 'only own unread replies', messages: [{ ...firstMessage, authorUserId: 9 }] },
      {
        label: 'received replies already read',
        messages: [{ ...firstMessage, readAt: '2026-10-23T07:30:00.000Z' }],
      },
    ])('should render $label without issuing a read update', ({ messages }) => {
      fixture.detectChanges();
      response$.next(messages);
      response$.complete();

      fixture.detectChanges();

      expect(component.isLoading()).toBe(false);
      expect(element().querySelectorAll('.conversation-message')).toHaveLength(messages.length);
      expect(element().querySelector('form')).not.toBeNull();
      expect(storeStub.markMessagesAsRead).not.toHaveBeenCalled();
      expect(unreadStoreStub.refresh).not.toHaveBeenCalled();
    });

    it('should not mark a late history response after closing before it arrives', () => {
      fixture.detectChanges();

      fixture.destroy();
      response$.next([firstMessage]);
      response$.complete();
      TestBed.tick();

      expect(storeStub.markMessagesAsRead).not.toHaveBeenCalled();
      expect(unreadStoreStub.refresh).not.toHaveBeenCalled();
      expect(component.messages()).toEqual([]);
    });

    it('should cancel the scheduled read update when closed after loading but before rendering', () => {
      fixture.detectChanges();
      response$.next([firstMessage]);
      response$.complete();
      expect(component.messages()).toEqual([firstMessage]);
      expect(storeStub.markMessagesAsRead).not.toHaveBeenCalled();
      expect(unreadStoreStub.refresh).not.toHaveBeenCalled();

      fixture.destroy();
      TestBed.tick();

      expect(storeStub.markMessagesAsRead).not.toHaveBeenCalled();
      expect(unreadStoreStub.refresh).not.toHaveBeenCalled();
    });

    it('should show a loading failure without marking or displaying its previously emitted history', () => {
      fixture.detectChanges();
      response$.next([firstMessage]);
      response$.error(new HttpErrorResponse({ status: 500 }));

      fixture.detectChanges();

      expect(element().querySelector('[role="alert"]')?.textContent).toContain(
        'Impossible de charger la conversation. Veuillez réessayer.',
      );
      expect(element().querySelector('.conversation-messages')).toBeNull();
      expect(element().querySelector('form')).toBeNull();
      expect(storeStub.markMessagesAsRead).not.toHaveBeenCalled();
      expect(unreadStoreStub.refresh).not.toHaveBeenCalled();
    });
  });
});

describe('ServiceRequestConversation shared unread counts integration', () => {
  const baseUrl = 'http://localhost:3000/service-requests';
  const countsUrl = `${baseUrl}/messages/unread-counts`;
  const receivedMessage: ServiceRequestMessage = {
    id: 101,
    content: 'Bonjour, voici une réponse à votre demande.',
    createdAt: '2026-10-23T10:30:00.000Z',
    readAt: null,
    serviceRequestId: 42,
    authorUserId: 8,
    author: { id: 8, firstName: 'Alice', lastName: 'Martin' },
  };
  let fixture: ComponentFixture<ServiceRequestConversation>;
  let httpTesting: HttpTestingController;
  let countsStore: InstanceType<typeof unreadMessageState>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ServiceRequestConversation],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthSession, useValue: { currentUser: () => ({ id: 9 }) } },
      ],
    }).compileComponents();
    httpTesting = TestBed.inject(HttpTestingController);
    countsStore = TestBed.inject(unreadMessageState);
    countsStore.refresh();
    httpTesting.expectOne(countsUrl).flush({ sentRequests: 2, receivedRequests: 1, total: 3 });
    fixture = TestBed.createComponent(ServiceRequestConversation);
    fixture.componentRef.setInput('serviceRequestId', 42);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  function renderReceivedMessage() {
    fixture.detectChanges();
    const loading = httpTesting.expectOne(`${baseUrl}/42/messages`);
    expect(loading.request.method).toBe('GET');
    httpTesting.expectNone(countsUrl);
    loading.flush([receivedMessage]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.conversation-message')).toHaveLength(1);
    const marking = httpTesting.expectOne(`${baseUrl}/42/messages/read`);
    expect(marking.request.method).toBe('PATCH');
    expect(marking.request.body).toEqual({ upToMessageId: 101 });
    httpTesting.expectNone(countsUrl);
    expect(countsStore.counts()).toEqual({ sentRequests: 2, receivedRequests: 1, total: 3 });
    return marking;
  }

  it.each([
    { sentRequests: 2, receivedRequests: 0, total: 2 },
    { sentRequests: 0, receivedRequests: 0, total: 0 },
  ])(
    'should reload server counts after the read acknowledgement and retain total=$total',
    (counts) => {
      const marking = renderReceivedMessage();

      marking.flush(null, { status: 204, statusText: 'No Content' });

      const refreshing = httpTesting.expectOne(countsUrl);
      expect(refreshing.request.method).toBe('GET');
      expect(refreshing.request.params.keys()).toEqual([]);
      expect(countsStore.isLoading()).toBe(true);
      refreshing.flush(counts);
      fixture.detectChanges();
      fixture.detectChanges();
      expect(countsStore.counts()).toEqual(counts);
      expect(countsStore.isLoading()).toBe(false);
      expect(countsStore.errorMessage()).toBeNull();
      expect(fixture.componentInstance.messages()).toEqual([receivedMessage]);
      expect(fixture.nativeElement.querySelector('form')).not.toBeNull();
      httpTesting.expectNone(countsUrl);
      httpTesting.expectNone(`${baseUrl}/42/messages/read`);
    },
  );

  it('should preserve counts and show the read error without refreshing after a failed read update', () => {
    const marking = renderReceivedMessage();

    marking.flush({ message: 'Server failure' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(countsStore.counts()).toEqual({ sentRequests: 2, receivedRequests: 1, total: 3 });
    expect(fixture.componentInstance.readError()).toBe(
      'Impossible de marquer les messages comme lus',
    );
    expect(fixture.nativeElement.querySelector('form')).not.toBeNull();
    httpTesting.expectNone(countsUrl);
  });

  it('should keep the conversation and draft after successful marking but failed count refreshing', () => {
    const marking = renderReceivedMessage();
    fixture.componentInstance.messageForm.controls.content.setValue('Mon brouillon');
    marking.flush(null, { status: 204, statusText: 'No Content' });

    httpTesting
      .expectOne(countsUrl)
      .flush({ message: 'Server failure' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(countsStore.counts()).toBeNull();
    expect(countsStore.errorMessage()).toBe('Impossible de charger les compteurs de messages.');
    expect(fixture.componentInstance.readError()).toBeNull();
    expect(fixture.componentInstance.messages()).toEqual([receivedMessage]);
    expect(fixture.componentInstance.messageForm.controls.content.value).toBe('Mon brouillon');
    expect(fixture.nativeElement.querySelector('form')).not.toBeNull();
    httpTesting.expectNone(countsUrl);
  });

  it('should cancel a pending read update on closure without issuing a count request', () => {
    const marking = renderReceivedMessage();

    fixture.destroy();

    expect(marking.cancelled).toBe(true);
    expect(countsStore.counts()).toEqual({ sentRequests: 2, receivedRequests: 1, total: 3 });
    httpTesting.expectNone(countsUrl);
  });
});
