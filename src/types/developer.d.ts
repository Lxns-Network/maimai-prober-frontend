export interface DeveloperProps {
  id: number;
  name: string;
  url: string;
  reason: string;
  apply_time: string;
  api_key: string;
}

export interface DeveloperUsage {
  window_days: number;
  overview: {
    total: number;
    daily_avg: number;
    peak_day?: string;
    peak_count: number;
    last_active?: string;
  };
  daily: { day: string; count: number }[];
  endpoints: { method: string; endpoint: string; count: number }[];
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
  is_dynamic?: boolean;
  developer?: {
    id: number;
    name: string;
    url: string;
  } | null;
}
