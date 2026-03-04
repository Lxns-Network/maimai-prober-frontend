export interface ApiResponse<T = unknown> {
  success: boolean;
  code?: number;
  message: string;
  data: T;
}

export interface OAuthAuthorizeResponse {
  code: string;
  state?: string;
}

export interface LogoUploadResponse {
  logo_url: string;
}
