import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ServiceProviderStore } from '../../services/service-provider-store';
import type { ServiceProvider } from '../../../models/service-provider.model';
import { finalize, forkJoin } from 'rxjs';
import { ReviewStore } from '../../../reviews/services/review-store';
import type { Review } from '../../../models/review.model';
import type { ReviewSummary } from '../../../models/review-summary.model';
import { DatePipe, DecimalPipe } from '@angular/common';

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
  }

  private readonly route: ActivatedRoute = inject(ActivatedRoute);
  private readonly serviceProviderStore: ServiceProviderStore = inject(ServiceProviderStore);
  private readonly reviewStore: ReviewStore = inject(ReviewStore);

  readonly isLoading = signal<boolean>(true);
  readonly errorMessage = signal<null | string>(null);
  readonly serviceProviderId: number = Number(this.route.snapshot.paramMap.get('id'));
  readonly serviceProvider = signal<ServiceProvider | undefined>(undefined);
  readonly isReviewLoading = signal<boolean>(true);
  readonly reviewsErrorMessage = signal<null | string>(null);
  readonly reviews = signal<Review[]>([]);
  readonly reviewSummary = signal<ReviewSummary>({ reviewCount: 0, averageRating: null });
}
