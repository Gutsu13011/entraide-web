import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink, Router } from '@angular/router';
import { ServiceProviderStore } from '../../services/service-provider-store';
import type { ServiceProvider } from '../../../models/service-provider.model';
import {
  catchError,
  distinctUntilChanged,
  EMPTY,
  finalize,
  forkJoin,
  map,
  pipe,
  Subject,
  switchMap,
  takeUntil,
  tap,
} from 'rxjs';
import { ReviewStore } from '../../../reviews/services/review-store';
import type { Review } from '../../../models/review.model';
import type { ReviewSummary } from '../../../models/review-summary.model';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ServiceOffering, ServicePricingType } from '../../../models/service-offering.model';
import { ServiceOfferingStore } from '../../../service-offerings/services/service-offering-store';
import { AuthSession } from '../../../auth/services/auth-session';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { rxMethod } from '@ngrx/signals/rxjs-interop';

@Component({
  imports: [RouterLink, DatePipe, DecimalPipe],
  selector: 'app-service-provider-detail',
  styleUrl: './service-provider-detail.scss',
  templateUrl: './service-provider-detail.html',
})
export class ServiceProviderDetail {
  constructor() {
    this.route.paramMap
      .pipe(
        map((params) => Number(params.get('id'))),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((id) => {
        this.providerChange$.next();
        this.serviceProviderId = id;
        this.deleteError.set(null);
        this.deleteOfferingError.set(null);
        this.loadProvider(id);
        this.loadReviews(id);
        this.loadOfferings(id);
      });
  }

  private readonly route: ActivatedRoute = inject(ActivatedRoute);
  private readonly serviceProviderStore: ServiceProviderStore = inject(ServiceProviderStore);
  private readonly reviewStore: ReviewStore = inject(ReviewStore);
  private readonly serviceOfferingsStore: ServiceOfferingStore = inject(ServiceOfferingStore);
  private readonly authSession = inject(AuthSession);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly providerChange$ = new Subject<void>();

  serviceProviderId: number = Number(this.route.snapshot.paramMap.get('id'));

  readonly isLoading = signal<boolean>(true);
  readonly errorMessage = signal<string | null>(null);
  readonly serviceProvider = signal<ServiceProvider | undefined>(undefined);
  readonly isReviewLoading = signal<boolean>(true);
  readonly reviewsErrorMessage = signal<null | string>(null);
  readonly reviews = signal<Review[]>([]);
  readonly reviewSummary = signal<ReviewSummary>({ reviewCount: 0, averageRating: null });
  readonly isServiceOfferingsLoading = signal<boolean>(true);
  readonly serviceOfferingErrorMessage = signal<string | null>(null);
  readonly serviceOfferings = signal<ServiceOffering[]>([]);
  readonly servicePricingType = ServicePricingType;
  readonly isOwner = computed(() => {
    const currentUser = this.authSession.currentUser();
    const serviceProvider = this.serviceProvider();

    if (currentUser === null || serviceProvider === undefined) {
      return false;
    }
    return currentUser.id === serviceProvider.ownerUserId;
  });
  readonly isDeleting = signal<boolean>(false);
  readonly deleteError = signal<string | null>(null);
  readonly deletingOfferingId = signal<number | null>(null);
  readonly deleteOfferingError = signal<string | null>(null);

  onDelete(): void {
    if (this.isDeleting() || !this.isOwner() || this.deletingOfferingId() !== null) {
      return;
    }

    const confirmed = window.confirm(
      'Supprimer définitivement votre fiche ainsi que toutes ses offres et tous ses avis ?',
    );

    if (!confirmed) {
      return;
    }

    this.isDeleting.set(true);
    this.deleteError.set(null);
    this.serviceProviderStore
      .remove(this.serviceProviderId)
      .pipe(
        takeUntil(this.providerChange$),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.isDeleting.set(false)),
      )
      .subscribe({
        next: () => {
          this.router.navigate(['/']);
        },
        error: () => {
          this.deleteError.set('Impossible de supprimer cette fiche. Veuillez réessayer.');
        },
      });
  }

  onDeleteOffering(offering: ServiceOffering): void {
    if (this.deletingOfferingId() !== null || !this.isOwner() || this.isDeleting()) {
      return;
    }

    const confirmed = window.confirm(`Supprimer définitivement l’offre « ${offering.title} » ?`);

    if (!confirmed) {
      return;
    }

    this.deletingOfferingId.set(offering.id);
    this.deleteOfferingError.set(null);
    this.serviceOfferingsStore
      .delete(this.serviceProviderId, offering.id)
      .pipe(
        takeUntil(this.providerChange$),
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.deletingOfferingId.set(null)),
      )
      .subscribe({
        next: () => {
          this.serviceOfferings.update((serviceOfferings) =>
            serviceOfferings.filter((serviceOffering) => serviceOffering.id !== offering.id),
          );
        },
        error: () => {
          this.deleteOfferingError.set('Impossible de supprimer cette offre. Veuillez réessayer.');
        },
      });
  }

  private readonly loadProvider = rxMethod<number>(
    pipe(
      switchMap((id) => {
        this.isLoading.set(true);
        this.errorMessage.set(null);
        this.serviceProvider.set(undefined);

        return this.serviceProviderStore.getById(id).pipe(
          tap((serviceProvider) => {
            this.serviceProvider.set(serviceProvider);
          }),
          catchError((error: unknown) => {
            console.error('error in ServiceProviderDetail', error);
            this.errorMessage.set('Impossible de charger cet intervenant.');
            return EMPTY;
          }),
          finalize(() => this.isLoading.set(false)),
        );
      }),
    ),
  );

  private readonly loadReviews = rxMethod<number>(
    pipe(
      switchMap((id) => {
        this.isReviewLoading.set(true);
        this.reviewsErrorMessage.set(null);
        this.reviews.set([]);
        this.reviewSummary.set({ reviewCount: 0, averageRating: null });

        return forkJoin({
          reviews: this.reviewStore.getAll(id),
          summary: this.reviewStore.getSummary(id),
        }).pipe(
          tap(({ reviews, summary }) => {
            this.reviews.set(reviews);
            this.reviewSummary.set(summary);
          }),
          catchError((error: unknown) => {
            console.error('error loading reviews in ServiceProviderDetail', error);
            this.reviewsErrorMessage.set('Impossible de charger les avis.');

            return EMPTY;
          }),
          finalize(() => this.isReviewLoading.set(false)),
        );
      }),
    ),
  );

  private readonly loadOfferings = rxMethod<number>(
    pipe(
      switchMap((id) => {
        this.isServiceOfferingsLoading.set(true);
        this.serviceOfferingErrorMessage.set(null);
        this.serviceOfferings.set([]);

        return this.serviceOfferingsStore.getAll(id).pipe(
          tap((serviceOfferings) => {
            this.serviceOfferings.set(serviceOfferings);
          }),
          catchError((error: unknown) => {
            console.error('error loading serviceOfferings in ServiceProviderDetail', error);
            this.serviceOfferingErrorMessage.set('Impossible de charger les offres.');

            return EMPTY;
          }),
          finalize(() => this.isServiceOfferingsLoading.set(false)),
        );
      }),
    ),
  );
}
