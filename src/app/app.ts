import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet, Router } from '@angular/router';
import { AuthSession } from './auth/services/auth-session';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly router = inject(Router);

  readonly authSession = inject(AuthSession);

  onLogout(): void {
    this.authSession.logout();
    this.router.navigate(['/login']);
  }
}
