import { Routes } from '@angular/router';
import { ServiceProviderList } from './service-providers/components/service-provider-list/service-provider-list';
import { ServiceProviderDetail } from './service-providers/components/service-provider-detail/service-provider-detail';
import { ServiceProviderForm } from './service-providers/components/service-provider-form/service-provider-form';

export const routes: Routes = [
  { path: '', component: ServiceProviderList },
  { path: 'service-providers/new', component: ServiceProviderForm },
  { path: 'service-providers/:id', component: ServiceProviderDetail },
];
