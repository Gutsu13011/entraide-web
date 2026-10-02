import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import type {
  CurrentUserResponse,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
} from '../../models/auth.model';
import { Observable } from 'rxjs';

@Service()
export class AuthStore {
  private readonly url = 'http://localhost:3000/auth';
  private readonly http = inject(HttpClient);

  login(loginRequest: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.url}/login`, loginRequest);
  }

  register(registerRequest: RegisterRequest): Observable<void> {
    return this.http.post<void>(`${this.url}/register`, registerRequest);
  }

  getCurrentUser(accessToken: string): Observable<CurrentUserResponse> {
    return this.http.get<CurrentUserResponse>(`${this.url}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }
}
