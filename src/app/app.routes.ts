import { Routes } from '@angular/router';
import { ServiceProviderList } from './service-providers/components/service-provider-list/service-provider-list';
import { authGuard } from './auth/guards/auth-guard';

export const routes: Routes = [
  { path: '', component: ServiceProviderList },
  {
    path: 'service-providers/new',
    loadComponent: () =>
      import('./service-providers/components/service-provider-form/service-provider-form').then(
        (module) => module.ServiceProviderForm,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'service-providers/:id/service-offerings/new',
    loadComponent: () =>
      import('./service-offerings/components/service-offering-form/service-offering-form').then(
        (module) => module.ServiceOfferingForm,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'service-providers/:id/service-offerings/:offeringId/edit',
    loadComponent: () =>
      import('./service-offerings/components/service-offering-form/service-offering-form').then(
        (module) => module.ServiceOfferingForm,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'service-providers/:id/service-offerings/:offeringId/service-requests/new',
    loadComponent: () =>
      import('./service-requests/components/service-request-form/service-request-form').then(
        (module) => module.ServiceRequestForm,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'service-providers/:id/edit',
    loadComponent: () =>
      import('./service-providers/components/service-provider-form/service-provider-form').then(
        (module) => module.ServiceProviderForm,
      ),
    canActivate: [authGuard],
  },
  {
    path: 'service-providers/:id',
    loadComponent: () =>
      import('./service-providers/components/service-provider-detail/service-provider-detail').then(
        (module) => module.ServiceProviderDetail,
      ),
  },
  {
    path: 'service-requests/sent',
    loadComponent: () =>
      import('./service-requests/components/service-request-list/service-request-list').then(
        (module) => module.ServiceRequestList,
      ),
    canActivate: [authGuard],
    data: { direction: 'sent' },
  },
  {
    path: 'service-requests/received',
    loadComponent: () =>
      import('./service-requests/components/service-request-list/service-request-list').then(
        (module) => module.ServiceRequestList,
      ),
    canActivate: [authGuard],
    data: { direction: 'received' },
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./auth/components/login-form/login-form').then((module) => module.LoginForm),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./auth/components/register-form/register-form').then((module) => module.RegisterForm),
  },
];
