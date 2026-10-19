import { Component, signal, inject, OnInit } from '@angular/core';
import {
  ServiceRequest,
  ServiceRequestStatus,
  UpdateServiceRequestStatus,
} from '../../../models/service-request.model';
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
  readonly updatingRequestId = signal<number | null>(null);
  readonly statusUpdateError = signal<string | null>(null);

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

  onUpdateStatus(
    serviceRequest: ServiceRequest,
    status: UpdateServiceRequestStatus['status'],
  ): void {
    if (
      this.isSentMode ||
      this.updatingRequestId() !== null ||
      serviceRequest.status === ServiceRequestStatus.REJECTED ||
      serviceRequest.status === ServiceRequestStatus.COMPLETED ||
      serviceRequest.status === status ||
      (status === ServiceRequestStatus.COMPLETED &&
        serviceRequest.status !== ServiceRequestStatus.ACCEPTED) ||
      (serviceRequest.status === ServiceRequestStatus.ACCEPTED &&
        status !== ServiceRequestStatus.COMPLETED)
    ) {
      return;
    }

    this.updatingRequestId.set(serviceRequest.id);
    this.statusUpdateError.set(null);
    this.serviceRequestsStore
      .updateStatus(serviceRequest.id, { status })
      .pipe(finalize(() => this.updatingRequestId.set(null)))
      .subscribe({
        next: (updatedRequest) => {
          this.serviceRequests.update((serviceRequests) =>
            serviceRequests.map((serviceRequest) =>
              serviceRequest.id === updatedRequest.id ? updatedRequest : serviceRequest,
            ),
          );
        },
        error: () => {
          this.statusUpdateError.set('Impossible de modifier cette demande. Veuillez réessayer.');
        },
      });
  }
}
