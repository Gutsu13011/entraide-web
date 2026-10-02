export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest extends LoginRequest {
  firstName: string;
  lastName: string;
}

export interface LoginResponse {
  accessToken: string;
}

export interface CurrentUserResponse {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}
