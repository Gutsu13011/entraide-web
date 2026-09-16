import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ServiceProvider } from '../../../models/service-provider.model';
import { ServiceProviderCard } from '../service-provider-card/service-provider-card';
import { ServiceProviderStore } from '../../services/service-provider-store';
import { finalize } from 'rxjs';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
@Component({
  imports: [ServiceProviderCard, RouterLink, ReactiveFormsModule],
  selector: 'app-service-provider-list',
  styleUrl: './service-provider-list.scss',
  templateUrl: './service-provider-list.html',
})
export class ServiceProviderList {
  constructor() {
    this.loadPage(1);
  }

  private readonly serviceProviderStore = inject(ServiceProviderStore);

  readonly isLoading = signal<boolean>(true);
  readonly errorMessage = signal<string | null>(null);
  readonly serviceProviders = signal<ServiceProvider[]>([]);
  readonly currentPage = signal<number>(1);
  readonly totalPages = signal<number>(0);
  readonly total = signal<number>(0);
  readonly searchTerm = signal<string>('');
  readonly searchControl = new FormControl('', { nonNullable: true });

  loadPage(page: number): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.serviceProviderStore
      .getAll({ page, search: this.searchTerm() })
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (response) => {
          this.serviceProviders.set(response.data);
          this.currentPage.set(response.page);
          this.totalPages.set(response.totalPages);
          this.total.set(response.total);
        },
        error: (error) => {
          console.error('error in ServiceProviderList', error);
          this.errorMessage.set('Impossible de charger les intervenants.');
        },
      });
  }

  applySearch(): void {
    const search = this.searchControl.value.trim();

    this.searchTerm.set(search);
    this.loadPage(1);
  }
}
