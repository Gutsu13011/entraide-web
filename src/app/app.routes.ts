import { Routes } from '@angular/router';
import { ServiceProviderList } from './service-providers/components/service-provider-list/service-provider-list';
import { ServiceProviderDetail } from './service-providers/components/service-provider-detail/service-provider-detail';
import { ServiceProviderForm } from './service-providers/components/service-provider-form/service-provider-form';
import { ServiceOfferingForm } from './service-offerings/components/service-offering-form/service-offering-form';
import { LoginForm } from './auth/components/login-form/login-form';
import { RegisterForm } from './auth/components/register-form/register-form';
import { authGuard } from './auth/guards/auth-guard';

export const routes: Routes = [
  { path: '', component: ServiceProviderList },
  { path: 'service-providers/new', component: ServiceProviderForm, canActivate: [authGuard] },
  {
    path: 'service-providers/:id/service-offerings/new',
    component: ServiceOfferingForm,
    canActivate: [authGuard],
  },
  {
    path: 'service-providers/:id/edit',
    component: ServiceProviderForm,
    canActivate: [authGuard],
  },
  { path: 'service-providers/:id', component: ServiceProviderDetail },
  { path: 'login', component: LoginForm },
  { path: 'register', component: RegisterForm },
];
