export interface DeveloperProps {
  id: number;
  name: string;
  url: string;
  reason: string;
  apply_time: string;
  api_key: string;
}

export interface OAuthAppProps {
  client_id?: string;
  client_secret?: string;
  name: string;
  description?: string;
  website?: string;
  logo_url?: string;
  redirect_uri: string;
  scope: string;
  create_time?: string;
  update_time?: string;

  user_authorized?: boolean;
  user_authorize_time?: string;
  developer?: {
    id: number;
    name: string;
    url: string;
  }
}