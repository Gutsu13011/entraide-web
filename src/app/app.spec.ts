import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { signal } from '@angular/core';
import { CurrentUserResponse } from './models/auth.model';
import { AuthSession } from './auth/services/auth-session';

describe('App', () => {
  const authSessionStub = {
    currentUser: signal<CurrentUserResponse | null>(null),
    logout: vi.fn(),
  };

  beforeEach(async () => {
    authSessionStub.currentUser.set(null);
    authSessionStub.logout.mockReset();

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), { provide: AuthSession, useValue: authSessionStub }],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render title', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Entraide');
  });

  it('should show the login link when no user is authenticated', async () => {
    const fixture = TestBed.createComponent(App);

    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[href="/login"]')).toBeTruthy();
  });

  it('should show the user name and logout button when authenticated', () => {
    const fixture = TestBed.createComponent(App);

    authSessionStub.currentUser.set({
      id: 1,
      firstName: 'Alice',
      lastName: 'Martin',
      email: 'alicemartin@example.com',
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('nav').textContent).toContain('Alice Martin');
    expect(fixture.nativeElement.querySelector('nav button').textContent).toContain(
      'Se déconnecter',
    );
    expect(fixture.nativeElement.querySelector('a[href="/login"]')).toBeNull();
  });

  it('should call logout when the logout button is clicked', () => {
    const fixture = TestBed.createComponent(App);

    authSessionStub.currentUser.set({
      id: 1,
      firstName: 'Alice',
      lastName: 'Martin',
      email: 'alicemartin@example.com',
    });
    fixture.detectChanges();
    fixture.nativeElement.querySelector('nav button').click();
    expect(authSessionStub.logout).toHaveBeenCalledTimes(1);
  });
});
