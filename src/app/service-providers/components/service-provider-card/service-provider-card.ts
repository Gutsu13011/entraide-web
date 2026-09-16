import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ServiceProvider } from '../../../models/service-provider.model';

@Component({
  imports: [RouterLink],
  selector: 'app-service-provider-card',
  styleUrl: './service-provider-card.scss',
  templateUrl: './service-provider-card.html',
})
export class ServiceProviderCard {
  readonly serviceProvider = input.required<ServiceProvider>();
}
