import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import type {
  CurrentUserResponse,
  LoginRequest,
  LoginResponse,
  RegisterRequest,
} from '../../models/auth.model';
import { Observable } from 'rxjs';
import { API_ORIGIN } from '../../../api.config';

@Service()
export class AuthStore {
  private readonly url = `${API_ORIGIN}/auth`;
  private readonly http = inject(HttpClient);

  login(loginRequest: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.url}/login`, loginRequest, {
      withCredentials: true,
    });
  }

  register(registerRequest: RegisterRequest): Observable<void> {
    return this.http.post<void>(`${this.url}/register`, registerRequest);
  }

  getCurrentUser(accessToken: string): Observable<CurrentUserResponse> {
    return this.http.get<CurrentUserResponse>(`${this.url}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  refresh(): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(
      `${this.url}/refresh`,
      {},
      {
        withCredentials: true,
      },
    );
  }

  logout(): Observable<void> {
    return this.http.post<void>(
      `${this.url}/logout`,
      {},
      {
        withCredentials: true,
      },
    );
  }
}
