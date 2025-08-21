export interface MaimaiScoreProps {
  id: number;
  song_name: string;
  level: string;
  level_index: number;
  achievements: number;
  fc: string;
  fs: string;
  dx_score: number;
  dx_star: number;
  dx_rating: number;
  rate: string;
  type: string;
  play_time?: string;
  upload_time: string;
  last_played_time?: string;
}

export interface ChunithmScoreProps {
  id: number;
  song_name: string;
  level: string;
  level_index: number;
  score: number;
  rating: number;
  over_power: number;
  clear: string;
  full_combo: string;
  full_chain: string;
  rank: string;
  play_time?: string;
  upload_time: string;
  last_played_time?: string;
}

export interface MaimaiBestsProps {
  standard: MaimaiScoreProps[];
  dx: MaimaiScoreProps[];
  standard_total: number;
  dx_total: number;
}

export interface ChunithmBestsProps {
  bests: ChunithmScoreProps[];
  selections: ChunithmScoreProps[];
  recents: ChunithmScoreProps[];
}