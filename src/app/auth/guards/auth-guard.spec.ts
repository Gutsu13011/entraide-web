import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, CanActivateFn, provideRouter, Router } from '@angular/router';
import { authGuard } from './auth-guard';
import { signal } from '@angular/core';
import { AuthSession } from '../services/auth-session';

describe('authGuard', () => {
  const authSessionStub = {
    isAuthenticated: signal<boolean>(false),
  };
  const executeGuard: CanActivateFn = (...guardParameters) =>
    TestBed.runInInjectionContext(() => authGuard(...guardParameters));

  let router: Router;

  beforeEach(() => {
    authSessionStub.isAuthenticated.set(false);

    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthSession, useValue: authSessionStub }],
    });

    router = TestBed.inject(Router);
  });

  it('should allow navigation when the user is authenticated', () => {
    authSessionStub.isAuthenticated.set(true);

    const executeGuardAction = executeGuard(
      new ActivatedRouteSnapshot(),
      router.routerState.snapshot,
    );

    expect(executeGuardAction).toBe(true);
  });

  it.each([
    '/service-requests/sent',
    '/service-providers/7/service-offerings/12/service-requests/new',
    '/service-requests/received?filter=pending&search=Alice%20Martin#latest',
  ])('should preserve the complete destination %s when redirecting to login', (destination) => {
    const state = router.routerState.snapshot;
    state.url = destination;
    const executeGuardAction = executeGuard(new ActivatedRouteSnapshot(), state);

    const loginUrl = `/login?returnUrl=${encodeURIComponent(destination)}`;
    expect(executeGuardAction).toEqual(router.parseUrl(loginUrl));
  });
});
