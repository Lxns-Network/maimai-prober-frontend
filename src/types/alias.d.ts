export interface AliasListProps {
  aliases: AliasProps[];
  page_count: number;
  page_size: number;
}

export interface AliasProps {
  alias_id: number;
  song: {
    id: number;
    name: string;
  };
  song_type: string;
  difficulty: number;
  alias: string;
  approved: boolean;
  weight: {
    up: number;
    down: number;
    total: number;
  };
  uploader: {
    id: number;
    name: string;
  };
  upload_time: string;
  // extra
  vote?: VoteProps;
}

export interface VoteProps {
  alias_id?: number;
  vote_id?: number;
  weight: number;
}