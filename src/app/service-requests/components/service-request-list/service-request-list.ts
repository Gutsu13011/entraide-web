import { Component, signal, inject, OnInit } from '@angular/core';
import { ServiceRequest, ServiceRequestStatus } from '../../../models/service-request.model';
import { ActivatedRoute } from '@angular/router';
import { ServiceRequestStore } from '../../services/service-request-store';
import { finalize } from 'rxjs';
import { DatePipe } from '@angular/common';
import { ServicePricingType } from '../../../models/service-offering.model';

@Component({
  imports: [DatePipe],
  selector: 'app-service-request-list',
  styleUrl: './service-request-list.scss',
  templateUrl: './service-request-list.html',
})
export class ServiceRequestList implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly serviceRequestsStore = inject(ServiceRequestStore);

  readonly serviceRequests = signal<ServiceRequest[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly loadError = signal<string | null>(null);
  readonly isSentMode = this.route.snapshot.data['direction'] === 'sent';
  readonly serviceRequestStatus = ServiceRequestStatus;
  readonly servicePricingType = ServicePricingType;

  ngOnInit(): void {
    this.isLoading.set(true);
    this.loadError.set(null);

    const request$ = this.isSentMode
      ? this.serviceRequestsStore.getSent()
      : this.serviceRequestsStore.getReceived();

    request$.pipe(finalize(() => this.isLoading.set(false))).subscribe({
      next: (serviceRequests) => {
        this.serviceRequests.set(serviceRequests);
      },
      error: () => {
        this.loadError.set('Impossible de charger vos demandes. Veuillez réessayer.');
      },
    });
  }
}
