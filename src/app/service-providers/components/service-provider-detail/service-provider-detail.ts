import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ServiceProviderStore } from '../../services/service-provider-store';
import type { ServiceProvider } from '../../../models/service-provider.model';
import { finalize, forkJoin } from 'rxjs';
import { ReviewStore } from '../../../reviews/services/review-store';
import type { Review } from '../../../models/review.model';
import type { ReviewSummary } from '../../../models/review-summary.model';
import { DatePipe, DecimalPipe } from '@angular/common';
import { ServiceOffering, ServicePricingType } from '../../../models/service-offering.model';
import { ServiceOfferingStore } from '../../../service-offerings/services/service-offering-store';
import { AuthSession } from '../../../auth/services/auth-session';

@Component({
  imports: [RouterLink, DatePipe, DecimalPipe],
  selector: 'app-service-provider-detail',
  styleUrl: './service-provider-detail.scss',
  templateUrl: './service-provider-detail.html',
})
export class ServiceProviderDetail {
  constructor() {
    this.serviceProviderStore
      .getById(this.serviceProviderId)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (serviceProvider) => {
          this.serviceProvider.set(serviceProvider);
        },
        error: (error) => {
          console.error('error in ServiceProviderDetail', error);
          this.errorMessage.set('Impossible de charger cet intervenant.');
        },
      });

    forkJoin({
      reviews: this.reviewStore.getAll(this.serviceProviderId),
      summary: this.reviewStore.getSummary(this.serviceProviderId),
    })
      .pipe(finalize(() => this.isReviewLoading.set(false)))
      .subscribe({
        next: ({ reviews, summary }) => {
          this.reviews.set(reviews);
          this.reviewSummary.set(summary);
        },
        error: (error) => {
          console.error('error loading reviews in ServiceProviderDetail', error);
          this.reviewsErrorMessage.set('Impossible de charger les avis.');
        },
      });

    this.serviceOfferingsStore
      .getAll(this.serviceProviderId)
      .pipe(finalize(() => this.isServiceOfferingsLoading.set(false)))
      .subscribe({
        next: (serviceOfferings) => {
          this.serviceOfferings.set(serviceOfferings);
        },
        error: (error) => {
          console.error('error loading serviceOfferings in ServiceProviderDetail', error);
          this.serviceOfferingErrorMessage.set('Impossible de charger les offres.');
        },
      });
  }

  private readonly route: ActivatedRoute = inject(ActivatedRoute);
  private readonly serviceProviderStore: ServiceProviderStore = inject(ServiceProviderStore);
  private readonly reviewStore: ReviewStore = inject(ReviewStore);
  private readonly serviceOfferingsStore: ServiceOfferingStore = inject(ServiceOfferingStore);
  private readonly authSession = inject(AuthSession);

  readonly isLoading = signal<boolean>(true);
  readonly errorMessage = signal<null | string>(null);
  readonly serviceProviderId: number = Number(this.route.snapshot.paramMap.get('id'));
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
}
