import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ServiceProvider } from '../../../models/service-provider.model';
import type {
  ServiceProviderSortOrder,
  ServiceProviderSortBy,
} from '../../../models/service-provider-query.model';
import { ServiceProviderCard } from '../service-provider-card/service-provider-card';
import { ServiceProviderStore } from '../../services/service-provider-store';
import { finalize } from 'rxjs';
import { FormControl, ReactiveFormsModule } from '@angular/forms';

type AvailabilityFilter = '' | 'true' | 'false';
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
  readonly cityFilter = signal<string>('');
  readonly cityControl = new FormControl('', { nonNullable: true });
  readonly availabilityFilter = signal<boolean | undefined>(undefined);
  readonly availabilityControl = new FormControl<AvailabilityFilter>('', { nonNullable: true });
  readonly sortBy = signal<ServiceProviderSortBy>('id');
  readonly sortByControl = new FormControl<ServiceProviderSortBy>('id', { nonNullable: true });
  readonly sortOrder = signal<ServiceProviderSortOrder>('ASC');
  readonly sortOrderControl = new FormControl<ServiceProviderSortOrder>('ASC', {
    nonNullable: true,
  });

  loadPage(page: number): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.serviceProviderStore
      .getAll({
        page,
        search: this.searchTerm(),
        city: this.cityFilter(),
        available: this.availabilityFilter(),
        sortBy: this.sortBy(),
        sortOrder: this.sortOrder(),
      })
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

  applyFilters(): void {
    const search = this.searchControl.value.trim();
    const city = this.cityControl.value.trim();
    const availability = this.availabilityControl.value;
    const available = availability === '' ? undefined : availability === 'true';

    this.searchTerm.set(search);
    this.cityFilter.set(city);
    this.availabilityFilter.set(available);
    this.sortBy.set(this.sortByControl.value);
    this.sortOrder.set(this.sortOrderControl.value);
    this.loadPage(1);
  }

  resetFilters(): void {
    this.searchControl.reset();
    this.cityControl.reset();
    this.availabilityControl.reset();
    this.sortByControl.reset();
    this.sortOrderControl.reset();

    this.applyFilters();
  }
}
