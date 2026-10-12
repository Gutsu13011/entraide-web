import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, Subject } from 'rxjs';
import { ServiceRequestList } from './service-request-list';
import { ServiceRequestStore } from '../../services/service-request-store';
import { ServiceRequest, ServiceRequestStatus } from '../../../models/service-request.model';
import { ServicePricingType } from '../../../models/service-offering.model';

describe('ServiceRequestList', () => {
  let component: ServiceRequestList;
  let fixture: ComponentFixture<ServiceRequestList>;
  const routeStub = { snapshot: { data: { direction: 'sent' } } };
  const storeStub = { getSent: vi.fn(), getReceived: vi.fn() };
  const sentRequest: ServiceRequest = {
    id: 42,
    message: 'Bonjour, je souhaite repeindre ma chambre.',
    status: ServiceRequestStatus.SENT,
    createdAt: '2026-10-12T10:30:00.000Z',
    requesterUserId: 8,
    recipientUserId: 9,
    serviceOfferingId: 12,
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
    storeStub.getSent.mockReset().mockReturnValue(of(sentRequests));
    storeStub.getReceived.mockReset().mockReturnValue(of(receivedRequests));
    await TestBed.configureTestingModule({
      imports: [ServiceRequestList],
      providers: [
        { provide: ActivatedRoute, useValue: routeStub },
        { provide: ServiceRequestStore, useValue: storeStub },
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
          expect(paragraphs).toContain('Demande envoyée');
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
});
