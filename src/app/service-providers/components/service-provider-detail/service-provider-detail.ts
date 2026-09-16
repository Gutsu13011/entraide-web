import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ServiceProviderStore } from '../../services/service-provider-store';
import { ServiceProvider } from '../../../models/service-provider.model';
import { finalize } from 'rxjs';

@Component({
  imports: [RouterLink],
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
  }

  private readonly route: ActivatedRoute = inject(ActivatedRoute);
  private readonly serviceProviderStore: ServiceProviderStore = inject(ServiceProviderStore);

  readonly isLoading = signal<boolean>(true);
  readonly errorMessage = signal<null | string>(null);
  readonly serviceProviderId: number = Number(this.route.snapshot.paramMap.get('id'));
  readonly serviceProvider = signal<ServiceProvider | undefined>(undefined);
}
