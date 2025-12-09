import type { RegistrationResponseJSON, AuthenticationResponseJSON } from "@simplewebauthn/browser";

export interface UserProps {
  id: number;
  name: string;
  email: string;
  permission: number;
  register_time: string;
  bind: UserBindProps;
  token?: string;
  // extra
  deleted?: boolean;
}

export interface UserBindProps {
  qq?: number;
}

export interface ConfigProps {
  allow_crawl_scores?: boolean;
  allow_crawl_name_plate?: boolean;
  allow_crawl_frame?: boolean;
  allow_crawl_map_icon?: boolean;
  crawl_scores_method?: string;
  crawl_scores_difficulty?: string[];
  allow_third_party_fetch_player?: boolean;
  allow_third_party_fetch_scores?: boolean;
  allow_third_party_write_data?: boolean;
}

export interface PasskeyRegisterData {
  name?: string;
  credential: RegistrationResponseJSON;
}

export interface PasskeyAuthenticateData {
  credential: AuthenticationResponseJSON;
}

export interface PasskeyUpdateNameData {
  name: string;
}

export interface PasskeyProps {
  id: number;
  credential_id: string;
  name: string | null;
  aaguid: string;
  backup_eligible: boolean;
  backup_state: boolean;
  create_time: string;
  last_used_time: string | null;
}