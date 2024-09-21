export interface UserProps {
  id: number;
  name: string;
  email: string;
  permission: number;
  register_time: string;
  bind: UserBindProps;
  token?: string;
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