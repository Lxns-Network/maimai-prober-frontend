import { Game } from "./game";

export interface ScoreChangeDetailProps {
  new: unknown;
  old: unknown;
}

export interface ScoreChangesProps {
  id: number;
  song_name: string;
  level: string;
  level_index: number;
  type: string;
  achievements: ScoreChangeDetailProps;
  dx_rating: ScoreChangeDetailProps;
  dx_score: ScoreChangeDetailProps;
  fc: ScoreChangeDetailProps;
  fs: ScoreChangeDetailProps;
  score: ScoreChangeDetailProps;
  rating: ScoreChangeDetailProps;
  over_power: ScoreChangeDetailProps;
  full_combo: ScoreChangeDetailProps;
  full_chain: ScoreChangeDetailProps;
}

export interface CrawlStatusProps {
  game: Game;
  friend_code: number;
  status: string;
  create_time: string;
  complete_time: string;
  scores: ScoreChangesProps[];
  failed_difficulties: number[];
}

export interface CrawlStatisticProps {
  success_rate: number;
  average_crawl_time: number;
}

export interface SyncResultSnapshot {
  game: Game;
  scores: ScoreChangesProps[];
}
