export interface MaimaiPlayerProps {
  name: string;
  rating: number;
  friend_code: number;
  trophy?: {
    name: string;
    color: string;
  };
  course_rank: number;
  class_rank: number;
  star: number;
  icon?: CollectionProps;
  name_plate?: CollectionProps;
  frame?: CollectionProps;
  upload_time: string;
}

export interface ChunithmPlayerProps {
  name: string;
  level: number;
  rating: number;
  friend_code: number;
  class_emblem: {
    base: number;
    medal: number;
  };
  reborn_count: number;
  trophy: {
    name: string;
    color: string;
  };
  over_power: number;
  over_power_progress: number;
  currency: number;
  total_currency: number;
  character?: CollectionProps;
  name_plate?: CollectionProps;
  map_icon?: CollectionProps;
  upload_time: string;
}

interface CollectionProps {
  id: number;
  name: string;
  level?: number;
}