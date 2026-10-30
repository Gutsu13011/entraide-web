import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize, of, Subject } from 'rxjs';
import { ServiceRequestList } from './service-request-list';
import { ServiceRequestStore } from '../../services/service-request-store';
import { ServiceRequest, ServiceRequestStatus } from '../../../models/service-request.model';
import { ServicePricingType } from '../../../models/service-offering.model';
import { ReviewForm } from '../../../reviews/components/review-form/review-form';
import { ReviewStore } from '../../../reviews/services/review-store';
import { By } from '@angular/platform-browser';
import type { Review } from '../../../models/review.model';
import { ServiceRequestConversation } from '../service-request-conversation/service-request-conversation';
import type { ServiceRequestMessage } from '../../../models/service-request-message.model';
import { AuthSession } from '../../../auth/services/auth-session';

describe('ServiceRequestList', () => {
  let component: ServiceRequestList;
  let fixture: ComponentFixture<ServiceRequestList>;
  const routeStub = { snapshot: { data: { direction: 'sent' } } };
  const storeStub = {
    getSent: vi.fn(),
    getReceived: vi.fn(),
    updateStatus: vi.fn(),
    getMessages: vi.fn(),
  };
  const reviewStoreStub = { add: vi.fn() };
  const authSessionStub = { currentUser: vi.fn() };
  const sentRequest: ServiceRequest = {
    id: 42,
    message: 'Bonjour, je souhaite repeindre ma chambre.',
    status: ServiceRequestStatus.SENT,
    hasReview: false,
    createdAt: '2026-10-12T10:30:00.000Z',
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
  const sentRequests: ServiceRequest[] = [
    {
      ...sentRequest,
      id: 43,
      createdAt: '2026-10-12T11:30:00.000Z',
      message: 'Bonjour, je souhaite un conseil.',
      serviceOfferingId: null,
      offeringTitleSnapshot: 'Conseil gratuit',
      offeringPricingTypeSnapshot: ServicePricingType.FREE,
      offeringHourlyRateSnapshot: null,
    },
    sentRequest,
  ];
  const receivedRequests: ServiceRequest[] = [
    {
      ...sentRequest,
      id: 44,
      requesterUserId: 9,
      recipientUserId: 8,
      requester: sentRequest.recipient,
      recipient: sentRequest.requester,
    },
  ];
  const modes = [
    {
      direction: 'sent',
      method: 'getSent' as const,
      unused: 'getReceived' as const,
      requests: sentRequests,
    },
    {
      direction: 'received',
      method: 'getReceived' as const,
      unused: 'getSent' as const,
      requests: receivedRequests,
    },
  ];

  function createList(direction: string) {
    routeStub.snapshot.data = { direction };
    fixture = TestBed.createComponent(ServiceRequestList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    reviewStoreStub.add.mockReset();
    authSessionStub.currentUser.mockReset().mockReturnValue(null);
    storeStub.updateStatus.mockReset();
    storeStub.getMessages.mockReset().mockReturnValue(of([]));
    storeStub.getSent.mockReset().mockReturnValue(of(sentRequests));
    storeStub.getReceived.mockReset().mockReturnValue(of(receivedRequests));
    await TestBed.configureTestingModule({
      imports: [ServiceRequestList],
      providers: [
        { provide: ActivatedRoute, useValue: routeStub },
        { provide: ServiceRequestStore, useValue: storeStub },
        { provide: ReviewStore, useValue: reviewStoreStub },
        { provide: AuthSession, useValue: authSessionStub },
      ],
    }).compileComponents();
  });

  it.each(modes)(
    'should load only $direction requests using route data and preserve the API response',
    ({ direction, method, unused, requests }) => {
      createList(direction);

      expect(component.isSentMode).toBe(direction === 'sent');
      expect(storeStub[method]).toHaveBeenCalledExactlyOnceWith();
      expect(storeStub[unused]).not.toHaveBeenCalled();
      expect(component.serviceRequests()).toEqual(requests);
      expect(component.isLoading()).toBe(false);
      expect(component.loadError()).toBeNull();
    },
  );

  it.each(modes)(
    'should treat an empty $direction response as a successful empty list',
    ({ direction, method, unused }) => {
      storeStub[method].mockReturnValue(of([]));

      createList(direction);

      expect(component.serviceRequests()).toEqual([]);
      expect(component.isLoading()).toBe(false);
      expect(component.loadError()).toBeNull();
      expect(storeStub[method]).toHaveBeenCalledExactlyOnceWith();
      expect(storeStub[unused]).not.toHaveBeenCalled();
    },
  );

  it.each(modes)(
    'should keep loading until the $direction request completes',
    ({ direction, method, requests }) => {
      const response$ = new Subject<ServiceRequest[]>();
      storeStub[method].mockReturnValue(response$);

      createList(direction);

      expect(component.isLoading()).toBe(true);
      expect(component.serviceRequests()).toEqual([]);
      expect(component.loadError()).toBeNull();
      response$.next(requests);
      expect(component.serviceRequests()).toEqual(requests);
      expect(component.isLoading()).toBe(true);
      response$.complete();
      expect(component.isLoading()).toBe(false);
      expect(component.loadError()).toBeNull();
    },
  );

  it.each(modes)(
    'should distinguish a $direction HTTP failure from an empty response and stop loading',
    ({ direction, method, unused }) => {
      const response$ = new Subject<ServiceRequest[]>();
      storeStub[method].mockReturnValue(response$);
      createList(direction);
      expect(component.isLoading()).toBe(true);

      response$.error(new HttpErrorResponse({ status: 500, statusText: 'Internal Server Error' }));

      expect(component.serviceRequests()).toEqual([]);
      expect(component.isLoading()).toBe(false);
      expect(component.loadError()).toBe('Impossible de charger vos demandes. Veuillez réessayer.');
      expect(storeStub[unused]).not.toHaveBeenCalled();
    },
  );

  it.each(modes)(
    'should unsubscribe from pending $direction loading on closure and ignore its late response',
    ({ direction, method, requests }) => {
      const response = new Subject<ServiceRequest[]>();
      const requestFinalized = vi.fn();
      storeStub[method].mockReturnValue(response.pipe(finalize(requestFinalized)));
      createList(direction);

      expect(component.isLoading()).toBe(true);
      expect(requestFinalized).not.toHaveBeenCalled();

      fixture.destroy();

      expect(requestFinalized).toHaveBeenCalledTimes(1);
      expect(component.isLoading()).toBe(false);

      response.next(requests);
      response.complete();

      expect(component.serviceRequests()).toEqual([]);
      expect(component.loadError()).toBeNull();
    },
  );

  describe('list display', () => {
    function element(): HTMLElement {
      return fixture.nativeElement as HTMLElement;
    }

    it.each(modes)(
      'should display the $direction title, counterparty, message, snapshots, status and date',
      ({ direction, requests }) => {
        createList(direction);

        expect(element().querySelector('h2')?.textContent?.trim()).toBe(
          direction === 'sent' ? 'Mes demandes envoyées' : 'Mes demandes reçues',
        );
        const cards = element().querySelectorAll('.service-request');
        expect(cards).toHaveLength(requests.length);
        requests.forEach((request, index) => {
          const card = cards[index];
          expect(card.querySelector('h3')?.textContent?.trim()).toBe(request.offeringTitleSnapshot);
          const participant = direction === 'sent' ? request.recipient : request.requester;
          const participantLabel = direction === 'sent' ? 'À' : 'De';
          const paragraphs = Array.from(card.querySelectorAll('p'), (p) => p.textContent?.trim());
          const expectedParticipant = `${participantLabel}: ${participant.firstName} ${participant.lastName}`;
          expect(paragraphs.map((p) => p?.replace(/\s*:\s*/, ': '))).toContain(expectedParticipant);
          const currentAccount = direction === 'sent' ? request.requester : request.recipient;
          expect(paragraphs.map((p) => p?.replace(/\s*:\s*/, ': '))).not.toContain(
            `${participantLabel}: ${currentAccount.firstName} ${currentAccount.lastName}`,
          );
          expect(card.querySelector('.request-message')?.textContent?.trim()).toBe(request.message);
          const expectedPrice =
            request.offeringPricingTypeSnapshot === ServicePricingType.FREE
              ? 'Prestation gratuite'
              : `${request.offeringHourlyRateSnapshot} € / heure`;
          expect(paragraphs).toContain(expectedPrice);
          expect(
            card.querySelector('.request-header .status-badge__label')?.textContent?.trim(),
          ).toBe('Demande envoyée');
          const time = card.querySelector('time');
          expect(time?.getAttribute('datetime')).toBe(request.createdAt);
          const expectedDate = new Intl.DateTimeFormat('fr-FR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(new Date(request.createdAt));
          expect(time?.textContent?.trim()).toBe(expectedDate);
        });
        expect(element().querySelector('[role="alert"]')).toBeNull();
        expect(element().querySelector('[role="status"]')).toBeNull();
      },
    );

    const statusLabels = [
      { status: ServiceRequestStatus.SENT, label: 'Demande envoyée', variant: 'sent' },
      { status: ServiceRequestStatus.READ, label: 'Demande lue', variant: 'read' },
      { status: ServiceRequestStatus.ACCEPTED, label: 'Demande acceptée', variant: 'accepted' },
      { status: ServiceRequestStatus.REJECTED, label: 'Demande refusée', variant: 'rejected' },
      {
        status: ServiceRequestStatus.COMPLETED,
        label: 'Prestation terminée',
        variant: 'completed',
      },
    ];

    it.each(modes.flatMap((mode) => statusLabels.map((entry) => ({ ...mode, ...entry }))))(
      'should display one $status badge beside the title in the $direction list',
      ({ direction, method, requests, status, label, variant }) => {
        const request = { ...requests[0], status };
        storeStub[method].mockReturnValue(of([request]));

        createList(direction);

        const cards = element().querySelectorAll('.service-request');
        expect(cards).toHaveLength(1);
        const header = cards[0].querySelector('.request-header');
        expect(header?.querySelector('h3')?.textContent?.trim()).toBe(
          request.offeringTitleSnapshot,
        );
        const badges = cards[0].querySelectorAll('.status-badge');
        expect(badges).toHaveLength(1);
        expect(header?.contains(badges[0])).toBe(true);
        expect(badges[0].querySelector('.status-badge__label')?.textContent?.trim()).toBe(label);
        expect(badges[0].classList.contains(`status-badge--${variant}`)).toBe(true);
        expect(badges[0].querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
        for (const other of statusLabels.filter((entry) => entry.status !== status)) {
          expect(cards[0].textContent).not.toContain(other.label);
        }
        expect(component.serviceRequests()).toEqual([request]);
      },
    );

    it.each(modes)(
      'should show the specific $direction empty message after a successful empty response',
      ({ direction, method }) => {
        storeStub[method].mockReturnValue(of([]));

        createList(direction);

        expect(element().querySelectorAll('.service-request')).toHaveLength(0);
        expect(element().textContent).toContain(
          direction === 'sent'
            ? 'Vous n’avez encore envoyé aucune demande.'
            : 'Vous n’avez encore reçu aucune demande.',
        );
        expect(element().querySelector('[role="alert"]')).toBeNull();
        expect(element().querySelector('[role="status"]')).toBeNull();
      },
    );

    it.each(modes)(
      'should show loading instead of cards or an empty message in $direction mode',
      ({ direction, method, requests }) => {
        const response$ = new Subject<ServiceRequest[]>();
        storeStub[method].mockReturnValue(response$);

        createList(direction);

        expect(element().querySelector('[role="status"]')?.textContent?.trim()).toBe(
          'Chargement de vos demandes...',
        );
        expect(element().querySelectorAll('.service-request')).toHaveLength(0);
        expect(element().textContent).not.toContain('Vous n’avez encore');
        response$.next(requests);
        response$.complete();
        fixture.detectChanges();

        expect(element().querySelector('[role="status"]')).toBeNull();
        expect(element().querySelectorAll('.service-request')).toHaveLength(requests.length);
      },
    );

    it.each(modes)(
      'should show a $direction loading failure as an alert instead of an empty list',
      ({ direction, method }) => {
        const response$ = new Subject<ServiceRequest[]>();
        storeStub[method].mockReturnValue(response$);
        createList(direction);

        response$.error(new HttpErrorResponse({ status: 500 }));
        fixture.detectChanges();

        const alert = element().querySelector('[role="alert"]');
        expect(alert?.textContent?.trim()).toBe(
          'Impossible de charger vos demandes. Veuillez réessayer.',
        );
        expect(alert?.classList.contains('error-message')).toBe(true);
        expect(element().querySelectorAll('.service-request')).toHaveLength(0);
        expect(element().querySelector('[role="status"]')).toBeNull();
        expect(element().textContent).not.toContain('Vous n’avez encore');
      },
    );

    it('should keep a deleted hourly offering request visible with its historical title and rate', () => {
      const historicalRequest: ServiceRequest = {
        ...sentRequest,
        serviceOfferingId: null,
        offeringTitleSnapshot: 'Ancienne prestation de peinture',
        offeringHourlyRateSnapshot: 25,
        message: 'Bonjour,\nje souhaite repeindre ma chambre.',
      };
      storeStub.getSent.mockReturnValue(of([historicalRequest]));

      createList('sent');

      const cards = element().querySelectorAll('.service-request');
      expect(cards).toHaveLength(1);
      expect(cards[0].querySelector('h3')?.textContent?.trim()).toBe(
        'Ancienne prestation de peinture',
      );
      expect(cards[0].textContent).toContain('25 € / heure');
      expect(cards[0].querySelector('.request-message')?.textContent?.trim()).toBe(
        historicalRequest.message,
      );
      expect(cards[0].textContent).not.toContain('null');
      expect(cards[0].textContent).not.toContain('undefined');
    });
  });

  describe('review opening', () => {
    const completedRequest: ServiceRequest = {
      ...sentRequest,
      status: ServiceRequestStatus.COMPLETED,
    };

    it('should select a completed sent request without changing the list or calling the update API', () => {
      storeStub.getSent.mockReturnValue(of([completedRequest]));
      createList('sent');
      const requestsBefore = component.serviceRequests();
      expect(component.reviewingRequestId()).toBeNull();

      component.onOpenReview(completedRequest);

      expect(component.reviewingRequestId()).toBe(completedRequest.id);
      expect(component.serviceRequests()).toBe(requestsBefore);
      expect(storeStub.updateStatus).not.toHaveBeenCalled();
    });

    it('should refuse a completed received request even when the provider exists and no form is open', () => {
      const received = { ...receivedRequests[0], status: ServiceRequestStatus.COMPLETED };
      storeStub.getReceived.mockReturnValue(of([received]));
      createList('received');

      component.onOpenReview(received);

      expect(component.reviewingRequestId()).toBeNull();
      expect(storeStub.updateStatus).not.toHaveBeenCalled();
    });

    it.each([
      ServiceRequestStatus.SENT,
      ServiceRequestStatus.READ,
      ServiceRequestStatus.ACCEPTED,
      ServiceRequestStatus.REJECTED,
    ])(
      'should refuse a sent request with status %s even when the provider exists and no form is open',
      (status) => {
        const candidate = { ...completedRequest, status };
        storeStub.getSent.mockReturnValue(of([candidate]));
        createList('sent');

        component.onOpenReview(candidate);

        expect(component.reviewingRequestId()).toBeNull();
        expect(storeStub.updateStatus).not.toHaveBeenCalled();
      },
    );

    it('should refuse a completed sent request whose provider was deleted', () => {
      const historical = { ...completedRequest, serviceProviderId: null, serviceOfferingId: null };
      storeStub.getSent.mockReturnValue(of([historical]));
      createList('sent');

      component.onOpenReview(historical);

      expect(component.reviewingRequestId()).toBeNull();
    });

    it('should keep the current review form selected when another completed request is opened', () => {
      const anotherRequest = { ...completedRequest, id: 43 };
      storeStub.getSent.mockReturnValue(of([completedRequest, anotherRequest]));
      createList('sent');
      component.reviewingRequestId.set(completedRequest.id);

      component.onOpenReview(anotherRequest);

      expect(component.reviewingRequestId()).toBe(completedRequest.id);
    });

    it('should allow reviewing a completed sent request after offering deletion when the provider still exists', () => {
      const historical = { ...completedRequest, serviceOfferingId: null };
      storeStub.getSent.mockReturnValue(of([historical]));
      createList('sent');

      component.onOpenReview(historical);

      expect(component.reviewingRequestId()).toBe(historical.id);
    });
  });

  describe('review publication confirmation', () => {
    const completed = { ...sentRequest, status: ServiceRequestStatus.COMPLETED };
    const otherRequest = { ...completed, id: 43 };

    function openAndSubmitReview(response$: Subject<Review>) {
      reviewStoreStub.add.mockReturnValue(response$);
      storeStub.getSent.mockReturnValue(of([otherRequest, completed]));
      createList('sent');
      const cards = fixture.nativeElement.querySelectorAll(
        '.service-request',
      ) as NodeListOf<HTMLElement>;
      cards[1].querySelector<HTMLButtonElement>('.request-actions button')!.click();
      fixture.detectChanges();
      const textarea = cards[1].querySelector('textarea')!;
      textarea.value = 'Prestation soignée.';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      cards[1]
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      fixture.detectChanges();
      return cards;
    }

    it('should disable cancellation while publishing and allow closing the form after a failed response', () => {
      const response$ = new Subject<Review>();
      const cards = openAndSubmitReview(response$);
      const cancelButton = cards[1].querySelector<HTMLButtonElement>(
        'app-review-form button[type="button"]',
      )!;
      expect(cancelButton.disabled).toBe(true);

      cancelButton.click();
      fixture.detectChanges();

      expect(component.reviewingRequestId()).toBe(completed.id);
      expect(cards[1].querySelector('app-review-form')).not.toBeNull();
      response$.error(new HttpErrorResponse({ status: 503 }));
      fixture.detectChanges();
      expect(cancelButton.disabled).toBe(false);
      expect(cards[1].querySelector('textarea')?.value).toBe('Prestation soignée.');
      cancelButton.click();
      fixture.detectChanges();
      expect(component.reviewingRequestId()).toBeNull();
      expect(cards[1].querySelector('app-review-form')).toBeNull();
      expect(component.serviceRequests().every((request) => !request.hasReview)).toBe(true);
      expect(cards[1].querySelector('.review-success')).toBeNull();
      expect(reviewStoreStub.add).toHaveBeenCalledOnce();
      expect(cards[0].querySelector<HTMLButtonElement>('.request-actions button')!.disabled).toBe(
        false,
      );
    });

    it('should mark only the published request as reviewed immutably and close the form', () => {
      const alreadyReviewed = { ...completed, id: 40, hasReview: true };
      const originalRequests = [alreadyReviewed, completed, otherRequest];
      storeStub.getSent.mockReturnValue(of(originalRequests));
      createList('sent');
      component.reviewingRequestId.set(completed.id);

      component.onReviewCreated(completed.id);

      expect(component.serviceRequests()).toEqual([
        alreadyReviewed,
        { ...completed, hasReview: true },
        otherRequest,
      ]);
      expect(component.serviceRequests()).not.toBe(originalRequests);
      expect(component.serviceRequests()[1]).not.toBe(completed);
      expect(component.serviceRequests()[0]).toBe(alreadyReviewed);
      expect(component.serviceRequests()[2]).toBe(otherRequest);
      expect(completed.hasReview).toBe(false);
      expect(originalRequests[1].hasReview).toBe(false);
      expect(component.reviewingRequestId()).toBeNull();
      expect(storeStub.updateStatus).not.toHaveBeenCalled();
      expect(reviewStoreStub.add).not.toHaveBeenCalled();
    });

    it('should refuse reopening an already reviewed request even when all other opening conditions pass', () => {
      const reviewed = { ...completed, hasReview: true };
      storeStub.getSent.mockReturnValue(of([reviewed]));
      createList('sent');

      component.onOpenReview(reviewed);

      expect(component.reviewingRequestId()).toBeNull();
      expect(component.serviceRequests()).toEqual([{ ...completed, hasReview: true }]);
    });

    it('should confirm only the published request and allow another request for the same provider to be reviewed', () => {
      const response$ = new Subject<Review>();
      const cards = openAndSubmitReview(response$);
      const previousRequests = component.serviceRequests();
      expect(reviewStoreStub.add).toHaveBeenCalledExactlyOnceWith(7, {
        serviceRequestId: 42,
        rating: 5,
        comment: 'Prestation soignée.',
      });
      expect(component.serviceRequests().every((request) => !request.hasReview)).toBe(true);
      expect(cards[1].querySelector('.review-success')).toBeNull();
      expect(cards[1].querySelector('app-review-form')).not.toBeNull();
      expect(component.reviewingRequestId()).toBe(42);

      response$.next({
        id: 8,
        authorName: 'Alice Martin',
        rating: 5,
        comment: 'Prestation soignée.',
        createdAt: '2026-10-20T14:00:00.000Z',
        serviceProviderId: 7,
      });
      response$.complete();
      fixture.detectChanges();

      expect(component.serviceRequests()).toEqual([
        otherRequest,
        { ...completed, hasReview: true },
      ]);
      expect(component.reviewingRequestId()).toBeNull();
      expect(cards[1].querySelector('app-review-form')).toBeNull();
      expect(cards[1].querySelector('button:not([aria-expanded])')).toBeNull();
      const confirmation = cards[1].querySelector('.review-success');
      expect(confirmation?.getAttribute('role')).toBe('status');
      expect(confirmation?.textContent).toContain('Votre avis a été publié');
      expect(cards[0].querySelector('.review-success')).toBeNull();
      const otherButton = cards[0].querySelector<HTMLButtonElement>('.request-actions button')!;
      expect(otherButton.disabled).toBe(false);
      expect(component.serviceRequests()).not.toBe(previousRequests);
      expect(component.serviceRequests()[0]).toBe(previousRequests[0]);
      expect(previousRequests[1].hasReview).toBe(false);
      expect(storeStub.updateStatus).not.toHaveBeenCalled();

      otherButton.click();
      fixture.detectChanges();

      const child = fixture.debugElement.query(By.directive(ReviewForm))
        .componentInstance as ReviewForm;
      expect(child.serviceProviderId()).toBe(7);
      expect(child.serviceRequestId()).toBe(43);
      expect(component.reviewingRequestId()).toBe(43);
      expect(reviewStoreStub.add).toHaveBeenCalledOnce();
    });

    it.each([403, 409])(
      'should keep the form open and leave the request unreviewed after an HTTP %s error',
      (status) => {
        const response$ = new Subject<Review>();
        const cards = openAndSubmitReview(response$);

        response$.error(new HttpErrorResponse({ status }));
        fixture.detectChanges();

        expect(component.serviceRequests().every((request) => !request.hasReview)).toBe(true);
        expect(component.reviewingRequestId()).toBe(42);
        expect(cards[1].querySelector('.review-success')).toBeNull();
        expect(cards[1].querySelector('app-review-form')).not.toBeNull();
        expect(cards[1].querySelector('[role="alert"]')?.textContent).toContain(
          'Impossible de publier votre avis',
        );
        expect(cards[1].querySelector('textarea')?.value).toBe('Prestation soignée.');
        expect(cards[1].querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(
          false,
        );
        expect(storeStub.updateStatus).not.toHaveBeenCalled();
      },
    );
  });

  describe('review indicators from the API', () => {
    it('should show loaded confirmations per request while keeping unreviewed requests to the same provider eligible', () => {
      const completed = { ...sentRequest, status: ServiceRequestStatus.COMPLETED };
      const reviewed = { ...completed, hasReview: true, serviceOfferingId: null };
      const unreviewed = { ...completed, id: 43 };
      storeStub.getSent.mockReturnValue(of([reviewed, unreviewed]));

      createList('sent');

      const cards = fixture.nativeElement.querySelectorAll(
        '.service-request',
      ) as NodeListOf<HTMLElement>;
      expect(cards[0].querySelector('.review-success')?.textContent).toContain(
        'Votre avis a été publié',
      );
      expect(cards[0].querySelector('button:not([aria-expanded])')).toBeNull();
      expect(cards[0].querySelector('app-review-form')).toBeNull();
      expect(cards[1].querySelector('.review-success')).toBeNull();
      const openButton = cards[1].querySelector<HTMLButtonElement>('.request-actions button')!;
      expect(openButton.disabled).toBe(false);
      expect(reviewStoreStub.add).not.toHaveBeenCalled();

      openButton.click();
      fixture.detectChanges();

      expect(component.reviewingRequestId()).toBe(unreviewed.id);
      expect(cards[1].querySelector('app-review-form')).not.toBeNull();
      expect(cards[0].querySelector('.review-success')).not.toBeNull();
    });

    it('should preserve hasReview in received requests without showing the requester review controls or confirmation', () => {
      const reviewed = {
        ...receivedRequests[0],
        status: ServiceRequestStatus.COMPLETED,
        hasReview: true,
      };
      storeStub.getReceived.mockReturnValue(of([reviewed]));

      createList('received');

      expect(component.serviceRequests()).toEqual([reviewed]);
      expect(fixture.nativeElement.querySelector('.review-success')).toBeNull();
      expect(fixture.nativeElement.querySelector('app-review-form')).toBeNull();
      expect(fixture.nativeElement.textContent).not.toContain('Donner mon avis');
      component.onOpenReview(reviewed);
      expect(component.reviewingRequestId()).toBeNull();
      expect(reviewStoreStub.add).not.toHaveBeenCalled();
    });
  });

  describe('review opening interactions', () => {
    function element(): HTMLElement {
      return fixture.nativeElement as HTMLElement;
    }

    it('should open only the clicked request form with its provider and request ids and disable other review buttons', () => {
      const completed = { ...sentRequest, status: ServiceRequestStatus.COMPLETED };
      const another = { ...completed, id: 43, serviceProviderId: 13 };
      storeStub.getSent.mockReturnValue(of([another, completed]));
      createList('sent');
      const cards = element().querySelectorAll('.service-request');
      expect(element().querySelector('app-review-form')).toBeNull();
      const firstButton = cards[0].querySelector<HTMLButtonElement>('.request-actions button')!;
      const selectedButton = cards[1].querySelector<HTMLButtonElement>('.request-actions button')!;

      selectedButton.click();
      fixture.detectChanges();

      expect(component.reviewingRequestId()).toBe(42);
      expect(cards[0].querySelector('app-review-form')).toBeNull();
      expect(cards[1].querySelector('app-review-form')).not.toBeNull();
      const children = fixture.debugElement.queryAll(By.directive(ReviewForm));
      expect(children).toHaveLength(1);
      const child = children[0].componentInstance as ReviewForm;
      expect(child.serviceProviderId()).toBe(7);
      expect(child.serviceRequestId()).toBe(42);
      expect(firstButton.disabled).toBe(true);
      expect(selectedButton.disabled).toBe(true);
      firstButton.click();
      fixture.detectChanges();
      expect(component.reviewingRequestId()).toBe(42);
      expect(fixture.debugElement.queryAll(By.directive(ReviewForm))).toHaveLength(1);
      expect(reviewStoreStub.add).not.toHaveBeenCalled();
    });

    it('should discard a cancelled draft, re-enable review actions and reopen fresh forms without publishing', () => {
      const completed = { ...sentRequest, status: ServiceRequestStatus.COMPLETED };
      const another = { ...completed, id: 43 };
      storeStub.getSent.mockReturnValue(of([another, completed]));
      createList('sent');
      const requestsBefore = component.serviceRequests();
      const cards = element().querySelectorAll('.service-request');
      const openButton = cards[1].querySelector<HTMLButtonElement>('.request-actions button')!;
      openButton.click();
      fixture.detectChanges();
      const child = fixture.debugElement.query(By.directive(ReviewForm))
        .componentInstance as ReviewForm;
      child.reviewForm.setValue({ rating: 2, comment: 'Brouillon à abandonner.' });
      fixture.detectChanges();
      const cancelButton = cards[1].querySelector<HTMLButtonElement>(
        'app-review-form button[type="button"]',
      )!;
      expect(cancelButton.textContent).toContain('Annuler');
      expect(cancelButton.disabled).toBe(false);

      cancelButton.click();
      fixture.detectChanges();

      expect(element().querySelector('app-review-form')).toBeNull();
      expect(component.reviewingRequestId()).toBeNull();
      expect(component.serviceRequests().every((request) => !request.hasReview)).toBe(true);
      expect(component.serviceRequests()).toBe(requestsBefore);
      expect(element().querySelector('.review-success')).toBeNull();
      for (const card of cards) {
        expect(card.querySelector<HTMLButtonElement>('.request-actions button')!.disabled).toBe(
          false,
        );
      }
      openButton.click();
      fixture.detectChanges();
      const reopened = fixture.debugElement.query(By.directive(ReviewForm))
        .componentInstance as ReviewForm;
      expect(reopened).not.toBe(child);
      expect(reopened.reviewForm.getRawValue()).toEqual({ rating: 5, comment: '' });
      expect(reopened.reviewForm.untouched).toBe(true);
      cards[1].querySelector<HTMLButtonElement>('app-review-form button[type="button"]')!.click();
      fixture.detectChanges();
      cards[0].querySelector<HTMLButtonElement>('.request-actions button')!.click();
      fixture.detectChanges();
      expect(component.reviewingRequestId()).toBe(another.id);
      expect(cards[0].querySelector('app-review-form')).not.toBeNull();
      expect(reviewStoreStub.add).not.toHaveBeenCalled();
      expect(storeStub.updateStatus).not.toHaveBeenCalled();
    });

    it('should hide the review action and form after provider deletion even if the request id is selected', () => {
      const historical = {
        ...sentRequest,
        status: ServiceRequestStatus.COMPLETED,
        serviceOfferingId: null,
        serviceProviderId: null,
      };
      storeStub.getSent.mockReturnValue(of([historical]));
      createList('sent');
      component.reviewingRequestId.set(historical.id);
      fixture.detectChanges();

      expect(element().textContent).not.toContain('Donner mon avis');
      expect(element().querySelector('app-review-form')).toBeNull();
      expect(reviewStoreStub.add).not.toHaveBeenCalled();
    });
  });

  describe('status updates', () => {
    const activeRequest = receivedRequests[0];
    const otherRequest: ServiceRequest = { ...activeRequest, id: 45, message: 'Autre demande' };
    const errorMessage = 'Impossible de modifier cette demande. Veuillez réessayer.';

    const validTransitions = [
      { from: ServiceRequestStatus.SENT, to: ServiceRequestStatus.READ },
      { from: ServiceRequestStatus.SENT, to: ServiceRequestStatus.ACCEPTED },
      { from: ServiceRequestStatus.SENT, to: ServiceRequestStatus.REJECTED },
      { from: ServiceRequestStatus.READ, to: ServiceRequestStatus.ACCEPTED },
      { from: ServiceRequestStatus.READ, to: ServiceRequestStatus.REJECTED },
      { from: ServiceRequestStatus.ACCEPTED, to: ServiceRequestStatus.COMPLETED },
    ] as const;
    const targets = [
      ServiceRequestStatus.READ,
      ServiceRequestStatus.ACCEPTED,
      ServiceRequestStatus.REJECTED,
      ServiceRequestStatus.COMPLETED,
    ] as const;
    const invalidTransitions = Object.values(ServiceRequestStatus).flatMap((from) =>
      targets
        .filter(
          (to) =>
            !validTransitions.some(
              (transition) => transition.from === from && transition.to === to,
            ),
        )
        .map((to) => ({ from, to })),
    );

    it.each(validTransitions)(
      'should update only the matching received request from $from to $to using the API response',
      ({ from, to }) => {
        const original = { ...activeRequest, status: from };
        const updated = { ...original, status: to };
        storeStub.getReceived.mockReturnValue(of([original, otherRequest]));
        storeStub.updateStatus.mockReturnValue(of(updated));
        createList('received');

        component.onUpdateStatus(original, to);

        expect(storeStub.updateStatus).toHaveBeenCalledExactlyOnceWith(original.id, { status: to });
        expect(component.serviceRequests()).toEqual([updated, otherRequest]);
        expect(component.serviceRequests()[0]).toBe(updated);
        expect(component.serviceRequests()[1]).toBe(otherRequest);
        expect(original.status).toBe(from);
        expect(component.statusUpdateError()).toBeNull();
        expect(component.updatingRequestId()).toBeNull();
        expect(storeStub.getReceived).toHaveBeenCalledTimes(1);
      },
    );

    it('should block status changes in the sent list without calling the API', () => {
      createList('sent');

      component.onUpdateStatus(sentRequest, ServiceRequestStatus.ACCEPTED);

      expect(storeStub.updateStatus).not.toHaveBeenCalled();
      expect(component.serviceRequests()).toEqual(sentRequests);
      expect(component.updatingRequestId()).toBeNull();
      expect(component.statusUpdateError()).toBeNull();
    });

    it.each(invalidTransitions)(
      'should block the invalid $from to $to transition without calling the API',
      ({ from, to }) => {
        const original = { ...activeRequest, status: from };
        storeStub.getReceived.mockReturnValue(of([original]));
        createList('received');

        component.onUpdateStatus(original, to);

        expect(storeStub.updateStatus).not.toHaveBeenCalled();
        expect(component.serviceRequests()).toEqual([original]);
        expect(component.updatingRequestId()).toBeNull();
        expect(component.statusUpdateError()).toBeNull();
      },
    );

    it('should block a repeated click and an update to another card while one update is pending', () => {
      const response$ = new Subject<ServiceRequest>();
      storeStub.getReceived.mockReturnValue(of([activeRequest, otherRequest]));
      storeStub.updateStatus.mockReturnValue(response$);
      createList('received');

      component.onUpdateStatus(activeRequest, ServiceRequestStatus.ACCEPTED);
      component.onUpdateStatus(activeRequest, ServiceRequestStatus.ACCEPTED);
      component.onUpdateStatus(otherRequest, ServiceRequestStatus.REJECTED);

      expect(storeStub.updateStatus).toHaveBeenCalledExactlyOnceWith(activeRequest.id, {
        status: ServiceRequestStatus.ACCEPTED,
      });
      expect(component.updatingRequestId()).toBe(activeRequest.id);
      expect(component.serviceRequests()).toEqual([activeRequest, otherRequest]);
      response$.complete();
      expect(component.updatingRequestId()).toBeNull();
    });

    it('should keep the old status until the response and clear the pending id only on completion', () => {
      const response$ = new Subject<ServiceRequest>();
      const updated = { ...activeRequest, status: ServiceRequestStatus.READ };
      storeStub.updateStatus.mockReturnValue(response$);
      createList('received');
      component.statusUpdateError.set('Ancienne erreur');

      component.onUpdateStatus(activeRequest, ServiceRequestStatus.READ);

      expect(component.updatingRequestId()).toBe(activeRequest.id);
      expect(component.statusUpdateError()).toBeNull();
      expect(component.serviceRequests()).toEqual(receivedRequests);
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Demande envoyée');

      response$.next(updated);
      fixture.detectChanges();
      expect(component.serviceRequests()).toEqual([updated]);
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Demande lue');
      expect(component.updatingRequestId()).toBe(activeRequest.id);

      response$.complete();
      expect(component.updatingRequestId()).toBeNull();
    });

    it.each([400, 401, 403, 404, 409])(
      'should preserve the list and expose an action error after an HTTP %s failure',
      (status) => {
        const response$ = new Subject<ServiceRequest>();
        storeStub.updateStatus.mockReturnValue(response$);
        createList('received');

        component.onUpdateStatus(activeRequest, ServiceRequestStatus.ACCEPTED);
        response$.error(new HttpErrorResponse({ status }));
        fixture.detectChanges();

        expect(component.serviceRequests()).toEqual(receivedRequests);
        expect(component.statusUpdateError()).toBe(errorMessage);
        expect(component.loadError()).toBeNull();
        expect(component.updatingRequestId()).toBeNull();
        expect(
          (fixture.nativeElement as HTMLElement).querySelectorAll('.service-request'),
        ).toHaveLength(1);
      },
    );

    it.each(['success', 'error'] as const)(
      'should cancel a status update on closure and ignore a late %s',
      (result) => {
        const response = new Subject<ServiceRequest>();
        const requestFinalized = vi.fn();
        storeStub.updateStatus.mockReturnValue(response.pipe(finalize(requestFinalized)));
        createList('received');
        const originalRequests = component.serviceRequests();

        component.onUpdateStatus(activeRequest, ServiceRequestStatus.ACCEPTED);

        expect(storeStub.updateStatus).toHaveBeenCalledExactlyOnceWith(activeRequest.id, {
          status: ServiceRequestStatus.ACCEPTED,
        });
        expect(component.updatingRequestId()).toBe(activeRequest.id);
        expect(requestFinalized).not.toHaveBeenCalled();

        fixture.destroy();

        expect(requestFinalized).toHaveBeenCalledTimes(1);
        expect(component.updatingRequestId()).toBeNull();

        if (result === 'success') {
          response.next({ ...activeRequest, status: ServiceRequestStatus.ACCEPTED });
          response.complete();
        } else {
          response.error(new HttpErrorResponse({ status: 500 }));
        }

        expect(component.serviceRequests()).toBe(originalRequests);
        expect(component.serviceRequests()[0].status).toBe(ServiceRequestStatus.SENT);
        expect(component.statusUpdateError()).toBeNull();
      },
    );

    it('should allow a new attempt after failure and clear the previous action error', () => {
      const firstResponse$ = new Subject<ServiceRequest>();
      const updated = { ...activeRequest, status: ServiceRequestStatus.ACCEPTED };
      storeStub.updateStatus.mockReturnValueOnce(firstResponse$).mockReturnValueOnce(of(updated));
      createList('received');
      component.onUpdateStatus(activeRequest, ServiceRequestStatus.ACCEPTED);
      firstResponse$.error(new HttpErrorResponse({ status: 500 }));
      expect(component.statusUpdateError()).toBe(errorMessage);

      component.onUpdateStatus(activeRequest, ServiceRequestStatus.ACCEPTED);

      expect(storeStub.updateStatus).toHaveBeenCalledTimes(2);
      expect(component.statusUpdateError()).toBeNull();
      expect(component.updatingRequestId()).toBeNull();
      expect(component.serviceRequests()).toEqual([updated]);
    });

    it('should allow a historical request update while preserving its nullable offering and free snapshot', () => {
      const historical: ServiceRequest = {
        ...activeRequest,
        serviceOfferingId: null,
        offeringPricingTypeSnapshot: ServicePricingType.FREE,
        offeringHourlyRateSnapshot: null,
      };
      const updated = { ...historical, status: ServiceRequestStatus.ACCEPTED };
      storeStub.getReceived.mockReturnValue(of([historical]));
      storeStub.updateStatus.mockReturnValue(of(updated));
      createList('received');

      component.onUpdateStatus(historical, ServiceRequestStatus.ACCEPTED);

      expect(storeStub.updateStatus).toHaveBeenCalledExactlyOnceWith(historical.id, {
        status: ServiceRequestStatus.ACCEPTED,
      });
      expect(component.serviceRequests()).toEqual([updated]);
    });

    it('should wait for completion confirmation and prevent a second update while it is pending', () => {
      const accepted = { ...activeRequest, status: ServiceRequestStatus.ACCEPTED };
      const completed = { ...accepted, status: ServiceRequestStatus.COMPLETED };
      const response$ = new Subject<ServiceRequest>();
      storeStub.getReceived.mockReturnValue(of([accepted, otherRequest]));
      storeStub.updateStatus.mockReturnValue(response$);
      createList('received');
      component.statusUpdateError.set('Ancienne erreur');

      component.onUpdateStatus(accepted, ServiceRequestStatus.COMPLETED);
      component.onUpdateStatus(accepted, ServiceRequestStatus.COMPLETED);
      component.onUpdateStatus(otherRequest, ServiceRequestStatus.ACCEPTED);

      expect(storeStub.updateStatus).toHaveBeenCalledExactlyOnceWith(accepted.id, {
        status: ServiceRequestStatus.COMPLETED,
      });
      expect(component.updatingRequestId()).toBe(accepted.id);
      expect(component.statusUpdateError()).toBeNull();
      expect(component.serviceRequests()).toEqual([accepted, otherRequest]);

      response$.next(completed);
      expect(component.serviceRequests()).toEqual([completed, otherRequest]);
      expect(component.updatingRequestId()).toBe(accepted.id);
      response$.complete();
      expect(component.updatingRequestId()).toBeNull();
      component.onUpdateStatus(completed, ServiceRequestStatus.COMPLETED);
      expect(storeStub.updateStatus).toHaveBeenCalledTimes(1);
    });

    it.each([403, 409])(
      'should preserve ACCEPTED after a completion failure with HTTP %s',
      (status) => {
        const accepted = { ...activeRequest, status: ServiceRequestStatus.ACCEPTED };
        const response$ = new Subject<ServiceRequest>();
        storeStub.getReceived.mockReturnValue(of([accepted]));
        storeStub.updateStatus.mockReturnValue(response$);
        createList('received');

        component.onUpdateStatus(accepted, ServiceRequestStatus.COMPLETED);
        response$.error(new HttpErrorResponse({ status }));

        expect(component.serviceRequests()).toEqual([accepted]);
        expect(component.updatingRequestId()).toBeNull();
        expect(component.statusUpdateError()).toBe(errorMessage);
        expect(component.loadError()).toBeNull();
      },
    );

    it('should complete an accepted historical request with its deleted offering and snapshots intact', () => {
      const historical: ServiceRequest = {
        ...activeRequest,
        status: ServiceRequestStatus.ACCEPTED,
        serviceOfferingId: null,
        offeringPricingTypeSnapshot: ServicePricingType.FREE,
        offeringHourlyRateSnapshot: null,
      };
      const completed = { ...historical, status: ServiceRequestStatus.COMPLETED };
      storeStub.getReceived.mockReturnValue(of([historical]));
      storeStub.updateStatus.mockReturnValue(of(completed));
      createList('received');

      component.onUpdateStatus(historical, ServiceRequestStatus.COMPLETED);

      expect(storeStub.updateStatus).toHaveBeenCalledExactlyOnceWith(historical.id, {
        status: ServiceRequestStatus.COMPLETED,
      });
      expect(component.serviceRequests()).toEqual([completed]);
    });
  });

  describe('status action interactions', () => {
    const activeRequest = receivedRequests[0];
    const otherRequest = { ...activeRequest, id: 45, message: 'Autre demande' };

    function element(): HTMLElement {
      return fixture.nativeElement as HTMLElement;
    }

    function buttons(card: Element): HTMLButtonElement[] {
      return Array.from(
        card.querySelectorAll<HTMLButtonElement>('.request-actions button:not([aria-expanded])'),
      );
    }

    function button(label: string, card: Element = element()): HTMLButtonElement {
      const match = buttons(card).find((candidate) => candidate.textContent?.trim() === label);
      expect(match, `Missing button: ${label}`).toBeDefined();
      return match!;
    }

    it.each(
      modes.flatMap((mode) =>
        Object.values(ServiceRequestStatus).map((status) => ({ ...mode, status })),
      ),
    )(
      'should show only the allowed action buttons for $status in the $direction list',
      ({ direction, method, requests, status }) => {
        storeStub[method].mockReturnValue(of([{ ...requests[0], status }]));
        createList(direction);

        const expected =
          direction === 'sent'
            ? status === ServiceRequestStatus.COMPLETED
              ? ['Donner mon avis']
              : []
            : status === ServiceRequestStatus.SENT
              ? ['Marquer comme lue', 'Accepter', 'Refuser']
              : status === ServiceRequestStatus.READ
                ? ['Accepter', 'Refuser']
                : status === ServiceRequestStatus.ACCEPTED
                  ? ['Marquer comme terminée']
                  : [];
        expect(buttons(element()).map((candidate) => candidate.textContent?.trim())).toEqual(
          expected,
        );
        for (const action of buttons(element())) {
          expect(action.type).toBe('button');
          expect(action.disabled).toBe(false);
        }
        expect(storeStub.updateStatus).not.toHaveBeenCalled();
      },
    );

    it.each([
      {
        from: ServiceRequestStatus.SENT,
        to: ServiceRequestStatus.READ,
        label: 'Marquer comme lue',
        result: 'Demande lue',
      },
      {
        from: ServiceRequestStatus.SENT,
        to: ServiceRequestStatus.ACCEPTED,
        label: 'Accepter',
        result: 'Demande acceptée',
      },
      {
        from: ServiceRequestStatus.SENT,
        to: ServiceRequestStatus.REJECTED,
        label: 'Refuser',
        result: 'Demande refusée',
      },
      {
        from: ServiceRequestStatus.READ,
        to: ServiceRequestStatus.ACCEPTED,
        label: 'Accepter',
        result: 'Demande acceptée',
      },
      {
        from: ServiceRequestStatus.READ,
        to: ServiceRequestStatus.REJECTED,
        label: 'Refuser',
        result: 'Demande refusée',
      },
      {
        from: ServiceRequestStatus.ACCEPTED,
        to: ServiceRequestStatus.COMPLETED,
        label: 'Marquer comme terminée',
        result: 'Prestation terminée',
      },
    ] as const)(
      'should change $from to $to through the $label button after API success',
      ({ from, to, label, result }) => {
        const original = { ...activeRequest, status: from };
        const updated = { ...original, status: to };
        const response$ = new Subject<ServiceRequest>();
        storeStub.getReceived.mockReturnValue(of([original]));
        storeStub.updateStatus.mockReturnValue(response$);
        createList('received');

        button(label).click();
        fixture.detectChanges();

        expect(storeStub.updateStatus).toHaveBeenCalledExactlyOnceWith(original.id, { status: to });
        expect(component.serviceRequests()).toEqual([original]);
        response$.next(updated);
        response$.complete();
        fixture.detectChanges();

        expect(element().textContent).toContain(result);
        expect(element().querySelector('[role="status"]')).toBeNull();
        expect(buttons(element()).map((candidate) => candidate.textContent?.trim())).toEqual(
          to === ServiceRequestStatus.READ
            ? ['Accepter', 'Refuser']
            : to === ServiceRequestStatus.ACCEPTED
              ? ['Marquer comme terminée']
              : [],
        );
      },
    );

    it('should disable all action buttons and show progress only on the card being updated', () => {
      const response$ = new Subject<ServiceRequest>();
      storeStub.getReceived.mockReturnValue(of([activeRequest, otherRequest]));
      storeStub.updateStatus.mockReturnValue(response$);
      createList('received');
      const cards = element().querySelectorAll('.service-request');
      const accept = button('Accepter', cards[0]);
      const otherReject = button('Refuser', cards[1]);

      accept.click();
      fixture.detectChanges();

      expect(buttons(element()).every((candidate) => candidate.disabled)).toBe(true);
      expect(cards[0].querySelector('[role="status"]')?.textContent?.trim()).toBe(
        'Modification en cours…',
      );
      expect(cards[1].querySelector('[role="status"]')).toBeNull();
      accept.click();
      otherReject.click();
      expect(storeStub.updateStatus).toHaveBeenCalledTimes(1);

      response$.next({ ...activeRequest, status: ServiceRequestStatus.ACCEPTED });
      response$.complete();
      fixture.detectChanges();

      expect(buttons(cards[0]).map((candidate) => candidate.textContent?.trim())).toEqual([
        'Marquer comme terminée',
      ]);
      expect(button('Marquer comme terminée', cards[0]).disabled).toBe(false);
      expect(buttons(cards[1]).every((candidate) => !candidate.disabled)).toBe(true);
      expect(element().querySelector('[role="status"]')).toBeNull();
    });

    it.each([403, 409])(
      'should display an HTTP %s action error as one alert without hiding the cards',
      (status) => {
        const response$ = new Subject<ServiceRequest>();
        storeStub.getReceived.mockReturnValue(of([activeRequest, otherRequest]));
        storeStub.updateStatus.mockReturnValue(response$);
        createList('received');

        button('Accepter', element().querySelectorAll('.service-request')[0]).click();
        response$.error(new HttpErrorResponse({ status }));
        fixture.detectChanges();

        const alerts = element().querySelectorAll('[role="alert"]');
        expect(alerts).toHaveLength(1);
        expect(alerts[0].classList.contains('error-message')).toBe(true);
        expect(alerts[0].textContent?.trim()).toBe(
          'Impossible de modifier cette demande. Veuillez réessayer.',
        );
        expect(element().querySelectorAll('.service-request')).toHaveLength(2);
        expect(component.serviceRequests()).toEqual([activeRequest, otherRequest]);
        expect(buttons(element()).every((candidate) => !candidate.disabled)).toBe(true);
        expect(element().querySelector('[role="status"]')).toBeNull();
      },
    );

    it('should clear the displayed error on retry and show the successful result', () => {
      const first$ = new Subject<ServiceRequest>();
      const second$ = new Subject<ServiceRequest>();
      storeStub.updateStatus.mockReturnValueOnce(first$).mockReturnValueOnce(second$);
      createList('received');
      button('Accepter').click();
      first$.error(new HttpErrorResponse({ status: 500 }));
      fixture.detectChanges();
      expect(element().querySelector('[role="alert"]')).not.toBeNull();

      button('Accepter').click();
      fixture.detectChanges();

      expect(element().querySelector('[role="alert"]')).toBeNull();
      expect(element().querySelector('[role="status"]')).not.toBeNull();
      expect(storeStub.updateStatus).toHaveBeenCalledTimes(2);
      second$.next({ ...activeRequest, status: ServiceRequestStatus.ACCEPTED });
      second$.complete();
      fixture.detectChanges();
      expect(element().textContent).toContain('Demande acceptée');
      expect(element().querySelector('[role="alert"]')).toBeNull();
      expect(buttons(element()).map((candidate) => candidate.textContent?.trim())).toEqual([
        'Marquer comme terminée',
      ]);
    });

    it('should disable completion and other actions until success then show the completed badge without buttons', () => {
      const accepted = { ...activeRequest, status: ServiceRequestStatus.ACCEPTED };
      const completed = { ...accepted, status: ServiceRequestStatus.COMPLETED };
      const response$ = new Subject<ServiceRequest>();
      storeStub.getReceived.mockReturnValue(of([accepted, otherRequest]));
      storeStub.updateStatus.mockReturnValue(response$);
      createList('received');
      const cards = element().querySelectorAll('.service-request');
      const finish = button('Marquer comme terminée', cards[0]);

      finish.click();
      fixture.detectChanges();

      expect(storeStub.updateStatus).toHaveBeenCalledExactlyOnceWith(accepted.id, {
        status: ServiceRequestStatus.COMPLETED,
      });
      expect(buttons(element()).every((candidate) => candidate.disabled)).toBe(true);
      expect(cards[0].querySelector('.status-badge__label')?.textContent?.trim()).toBe(
        'Demande acceptée',
      );
      expect(cards[0].querySelector('[role="status"]')?.textContent?.trim()).toBe(
        'Modification en cours…',
      );
      expect(cards[1].querySelector('[role="status"]')).toBeNull();
      finish.click();
      button('Accepter', cards[1]).click();
      expect(storeStub.updateStatus).toHaveBeenCalledTimes(1);

      response$.next(completed);
      response$.complete();
      fixture.detectChanges();

      const badge = cards[0].querySelector('.status-badge--completed');
      expect(badge?.querySelector('.status-badge__label')?.textContent?.trim()).toBe(
        'Prestation terminée',
      );
      expect(badge?.querySelector('svg circle')).not.toBeNull();
      expect(buttons(cards[0])).toHaveLength(0);
      expect(buttons(cards[1]).every((candidate) => !candidate.disabled)).toBe(true);
      expect(component.serviceRequests()[1]).toBe(otherRequest);
      expect(element().querySelector('[role="status"]')).toBeNull();
    });

    it.each([403, 409])(
      'should preserve the accepted badge and re-enable completion after an HTTP %s failure',
      (status) => {
        const accepted = { ...activeRequest, status: ServiceRequestStatus.ACCEPTED };
        const response$ = new Subject<ServiceRequest>();
        storeStub.getReceived.mockReturnValue(of([accepted]));
        storeStub.updateStatus.mockReturnValue(response$);
        createList('received');

        button('Marquer comme terminée').click();
        response$.error(new HttpErrorResponse({ status }));
        fixture.detectChanges();

        expect(element().querySelector('.status-badge__label')?.textContent?.trim()).toBe(
          'Demande acceptée',
        );
        expect(element().querySelector('.status-badge--completed')).toBeNull();
        expect(button('Marquer comme terminée').disabled).toBe(false);
        expect(element().querySelectorAll('.service-request')).toHaveLength(1);
        expect(element().querySelector('[role="alert"]')?.textContent?.trim()).toBe(
          'Impossible de modifier cette demande. Veuillez réessayer.',
        );
        expect(element().querySelector('[role="status"]')).toBeNull();
      },
    );

    it('should allow completion retry after a server error and clear the displayed error during the new attempt', () => {
      const accepted = { ...activeRequest, status: ServiceRequestStatus.ACCEPTED };
      const first$ = new Subject<ServiceRequest>();
      const second$ = new Subject<ServiceRequest>();
      storeStub.getReceived.mockReturnValue(of([accepted]));
      storeStub.updateStatus.mockReturnValueOnce(first$).mockReturnValueOnce(second$);
      createList('received');
      button('Marquer comme terminée').click();
      first$.error(new HttpErrorResponse({ status: 500 }));
      fixture.detectChanges();
      expect(element().querySelector('[role="alert"]')).not.toBeNull();

      button('Marquer comme terminée').click();
      fixture.detectChanges();

      expect(element().querySelector('[role="alert"]')).toBeNull();
      expect(element().querySelector('[role="status"]')).not.toBeNull();
      expect(storeStub.updateStatus).toHaveBeenCalledTimes(2);
      second$.next({ ...accepted, status: ServiceRequestStatus.COMPLETED });
      second$.complete();
      fixture.detectChanges();
      expect(element().querySelector('.status-badge__label')?.textContent?.trim()).toBe(
        'Prestation terminée',
      );
      expect(buttons(element())).toHaveLength(0);
      expect(element().querySelector('[role="alert"]')).toBeNull();
    });
  });

  describe('conversation opening interactions', () => {
    it('should unsubscribe the old loading conversation when switching and preserve the new discussion after a late response', () => {
      const oldResponse$ = new Subject<ServiceRequestMessage[]>();
      const newResponse$ = new Subject<ServiceRequestMessage[]>();
      const teardown = vi.fn();
      storeStub.getMessages
        .mockReturnValueOnce(oldResponse$.pipe(finalize(teardown)))
        .mockReturnValueOnce(newResponse$);
      createList('sent');
      toggle(cards()[0]).click();
      fixture.detectChanges();
      expect(teardown).not.toHaveBeenCalled();

      toggle(cards()[1]).click();
      fixture.detectChanges();

      expect(teardown).toHaveBeenCalledTimes(1);
      expect(storeStub.getMessages).toHaveBeenNthCalledWith(2, sentRequests[1].id);
      newResponse$.next([savedMessage]);
      newResponse$.complete();
      fixture.detectChanges();
      oldResponse$.next([
        {
          ...savedMessage,
          serviceRequestId: sentRequests[0].id,
          content: 'Ancienne réponse à ignorer',
        },
      ]);
      oldResponse$.complete();
      fixture.detectChanges();
      expect(cards()[0].querySelector('app-service-request-conversation')).toBeNull();
      expect(cards()[1].textContent).toContain(savedMessage.content);
      expect(cards()[1].textContent).not.toContain('Ancienne réponse à ignorer');
      const child = fixture.debugElement.query(By.directive(ServiceRequestConversation))
        .componentInstance as ServiceRequestConversation;
      expect(child.messages()).toEqual([savedMessage]);
      expect(child.isLoading()).toBe(false);
    });

    const savedMessage: ServiceRequestMessage = {
      id: 101,
      content: 'Bonjour, samedi à 10 heures me convient.',
      createdAt: '2026-10-22T09:30:00.000Z',
      readAt: null,
      serviceRequestId: 42,
      authorUserId: 8,
      author: sentRequest.requester,
    };

    function cards(): HTMLElement[] {
      return Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('.service-request'),
      );
    }

    function toggle(card: HTMLElement): HTMLButtonElement {
      return card.querySelector<HTMLButtonElement>('button[aria-expanded]')!;
    }

    it.each(modes)(
      'should load only the clicked $direction conversation when its disclosure button is opened',
      ({ direction, requests }) => {
        createList(direction);
        const initialRequests = component.serviceRequests();
        expect(component.openedConversationId()).toBeNull();
        expect(storeStub.getMessages).not.toHaveBeenCalled();
        expect(fixture.debugElement.query(By.directive(ServiceRequestConversation))).toBeNull();
        for (const card of cards()) {
          expect(toggle(card).type).toBe('button');
          expect(toggle(card).getAttribute('aria-expanded')).toBe('false');
          expect(toggle(card).textContent).toContain('Voir la discussion');
        }

        toggle(cards()[0]).click();
        fixture.detectChanges();

        expect(component.openedConversationId()).toBe(requests[0].id);
        expect(storeStub.getMessages).toHaveBeenCalledExactlyOnceWith(requests[0].id);
        expect(toggle(cards()[0]).getAttribute('aria-expanded')).toBe('true');
        expect(toggle(cards()[0]).textContent).toContain('Fermer la discussion');
        const children = fixture.debugElement.queryAll(By.directive(ServiceRequestConversation));
        expect(children).toHaveLength(1);
        expect(children[0].componentInstance.serviceRequestId()).toBe(requests[0].id);
        expect(cards()[0].querySelector('app-service-request-conversation')).not.toBeNull();
        for (const card of cards().slice(1)) {
          expect(card.querySelector('app-service-request-conversation')).toBeNull();
          expect(toggle(card).getAttribute('aria-expanded')).toBe('false');
        }
        expect(component.serviceRequests()).toBe(initialRequests);
        expect(storeStub.updateStatus).not.toHaveBeenCalled();
        expect(reviewStoreStub.add).not.toHaveBeenCalled();
      },
    );

    it('should destroy a closed conversation and reload fresh messages when it is reopened', () => {
      const updatedMessage = { ...savedMessage, id: 102, content: 'Voici une nouvelle réponse.' };
      storeStub.getSent.mockReturnValue(of([sentRequest]));
      storeStub.getMessages
        .mockReturnValueOnce(of([savedMessage]))
        .mockReturnValueOnce(of([updatedMessage]));
      createList('sent');
      const button = toggle(cards()[0]);
      button.click();
      fixture.detectChanges();
      const originalChild = fixture.debugElement.query(
        By.directive(ServiceRequestConversation),
      ).componentInstance;
      expect(cards()[0].textContent).toContain(savedMessage.content);

      button.click();
      fixture.detectChanges();

      expect(component.openedConversationId()).toBeNull();
      expect(fixture.debugElement.query(By.directive(ServiceRequestConversation))).toBeNull();
      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(storeStub.getMessages).toHaveBeenCalledTimes(1);
      button.click();
      fixture.detectChanges();
      const reopenedChild = fixture.debugElement.query(
        By.directive(ServiceRequestConversation),
      ).componentInstance;
      expect(reopenedChild).not.toBe(originalChild);
      expect(storeStub.getMessages).toHaveBeenNthCalledWith(2, sentRequest.id);
      expect(storeStub.getMessages).toHaveBeenCalledTimes(2);
      expect(cards()[0].textContent).toContain(updatedMessage.content);
      expect(cards()[0].textContent).not.toContain(savedMessage.content);
    });

    it('should replace the open conversation when another request to the same provider is selected', () => {
      createList('sent');
      toggle(cards()[0]).click();
      fixture.detectChanges();
      const originalChild = fixture.debugElement.query(
        By.directive(ServiceRequestConversation),
      ).componentInstance;

      toggle(cards()[1]).click();
      fixture.detectChanges();

      expect(component.openedConversationId()).toBe(sentRequests[1].id);
      expect(storeStub.getMessages).toHaveBeenNthCalledWith(1, sentRequests[0].id);
      expect(storeStub.getMessages).toHaveBeenNthCalledWith(2, sentRequests[1].id);
      expect(storeStub.getMessages).toHaveBeenCalledTimes(2);
      expect(cards()[0].querySelector('app-service-request-conversation')).toBeNull();
      expect(toggle(cards()[0]).getAttribute('aria-expanded')).toBe('false');
      expect(toggle(cards()[1]).getAttribute('aria-expanded')).toBe('true');
      const children = fixture.debugElement.queryAll(By.directive(ServiceRequestConversation));
      expect(children).toHaveLength(1);
      expect(children[0].componentInstance).not.toBe(originalChild);
      expect(children[0].componentInstance.serviceRequestId()).toBe(sentRequests[1].id);
    });

    it('should keep a completed conversation accessible after provider and offering deletion', () => {
      const historical = {
        ...receivedRequests[0],
        status: ServiceRequestStatus.COMPLETED,
        serviceOfferingId: null,
        serviceProviderId: null,
      };
      storeStub.getReceived.mockReturnValue(of([historical]));
      createList('received');

      toggle(cards()[0]).click();
      fixture.detectChanges();

      expect(storeStub.getMessages).toHaveBeenCalledExactlyOnceWith(historical.id);
      expect(cards()[0].querySelector('app-service-request-conversation')).not.toBeNull();
      expect(component.serviceRequests()).toEqual([historical]);
      expect(storeStub.updateStatus).not.toHaveBeenCalled();
    });

    it('should allow closing a failed conversation and retry loading it by reopening', () => {
      const firstResponse$ = new Subject<ServiceRequestMessage[]>();
      storeStub.getSent.mockReturnValue(of([sentRequest]));
      storeStub.getMessages
        .mockReturnValueOnce(firstResponse$)
        .mockReturnValueOnce(of([savedMessage]));
      createList('sent');
      const button = toggle(cards()[0]);
      button.click();
      fixture.detectChanges();
      firstResponse$.error(new HttpErrorResponse({ status: 500 }));
      fixture.detectChanges();
      expect(cards()[0].querySelector('[role="alert"]')).not.toBeNull();

      button.click();
      fixture.detectChanges();
      button.click();
      fixture.detectChanges();

      expect(storeStub.getMessages).toHaveBeenCalledTimes(2);
      expect(cards()[0].querySelector('[role="alert"]')).toBeNull();
      expect(cards()[0].textContent).toContain(savedMessage.content);
      expect(component.loadError()).toBeNull();
    });
  });
});
