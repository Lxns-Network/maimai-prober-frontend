import { Game } from "@/types/game";

export const queryKeys = {
  user: {
    profile: () => ["user/profile"] as const,
    refresh: () => ["user/refresh"] as const,
  },
  player: {
    root: (game: Game) => [`user/${game}/player`] as const,
    scores: (game: Game) => [`user/${game}/player/scores`] as const,
    bests: (game: Game) => [`user/${game}/player/bests`] as const,
    collections: (game: Game, type: string) => [`user/${game}/player/${type}`] as const,
    heatmap: (game: Game) => [`user/${game}/player/heatmap`] as const,
    ratingTrend: (game: Game, version: number) => [`user/${game}/player/trend?version=${version}`] as const,
    yearInReview: (game: Game, year: number, shareToken?: string, agree?: boolean) => {
      let url = shareToken
        ? `${game}/year-in-review/${year}/share/${shareToken}`
        : `user/${game}/player/year-in-review/${year}`;
      if (agree) url += "?agree=true";
      return [url] as const;
    },
  },
  config: {
    site: () => ["site/config"] as const,
    user: (game: Game) => [`user/${game}/config`] as const,
  },
  collections: {
    list: (game: Game, collectionType: string, required: boolean) =>
      [`${game}/${collectionType}/list?required=${required}`] as const,
  },
  developer: {
    apply: () => ["user/developer/apply"] as const,
    oauthApps: () => ["user/developer/oauth/apps"] as const,
  },
  oauth: {
    authorizeInfo: (params: URLSearchParams) =>
      [`user/oauth/authorize/info?${params.toString()}`] as const,
    authorizeList: () => ["user/oauth/authorize/list"] as const,
  },
  alias: {
    list: (game: Game, params: URLSearchParams) =>
      [`user/${game}/alias/list?${params.toString()}`] as const,
    votes: (game: Game) => [`user/${game}/alias/votes`] as const,
  },
  scores: {
    ranking: (game: Game, params: URLSearchParams) =>
      [`user/${game}/player/score/ranking?${params.toString()}`] as const,
    history: (game: Game, params: URLSearchParams) =>
      [`user/${game}/player/score/history?${params.toString()}`] as const,
  },
  song: {
    detail: (game: Game, id: number) =>
      [`${game}/song/${id}`] as const,
    bests: (game: Game, songId: number) =>
      [`user/${game}/player/bests?song_id=${songId}`] as const,
  },
  comments: {
    list: (game: Game, params: URLSearchParams) =>
      [`user/${game}/comment/list?${params.toString()}`] as const,
  },
} as const;
