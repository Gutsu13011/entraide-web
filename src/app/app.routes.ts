import { Routes } from '@angular/router';
import { ServiceProviderList } from './service-providers/components/service-provider-list/service-provider-list';
import { ServiceProviderDetail } from './service-providers/components/service-provider-detail/service-provider-detail';
import { ServiceProviderForm } from './service-providers/components/service-provider-form/service-provider-form';
import { ServiceOfferingForm } from './service-offerings/components/service-offering-form/service-offering-form';
import { LoginForm } from './auth/components/login-form/login-form';
import { RegisterForm } from './auth/components/register-form/register-form';

export const routes: Routes = [
  { path: '', component: ServiceProviderList },
  { path: 'service-providers/new', component: ServiceProviderForm },
  { path: 'service-providers/:id/service-offerings/new', component: ServiceOfferingForm },
  { path: 'service-providers/:id', component: ServiceProviderDetail },
  { path: 'login', component: LoginForm },
  { path: 'register', component: RegisterForm },
];
