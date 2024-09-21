import { fetchAPI } from "./api.ts";

export async function createAlias(game: string, data: any) {
  return fetchAPI(`user/${game}/alias`, { method: "POST", body: data });
}

export async function voteAlias(game: string, aliasId: number, vote: boolean) {
  return fetchAPI(`user/${game}/alias/${aliasId}/vote/${vote ? 'up' : 'down'}`, { method: "POST" });
}

export async function deleteUserAlias(game: string, aliasId: number) {
  return fetchAPI(`user/${game}/alias/${aliasId}`, { method: "DELETE" });
}

export async function deleteAlias(game: string, aliasId: number) {
  return fetchAPI(`user/admin/${game}/alias/${aliasId}`, { method: "DELETE" });
}

export async function approveAlias(game: string, aliasId: number) {
  return fetchAPI(`user/admin/${game}/alias/${aliasId}/approve`, { method: "POST" });
}

export class AliasList {
  game: string = "";
  aliases: any[] = [];
  searchMap: any = {};

  constructor(game: string) {
    this.game = game;
  }

  private parseSearchMap() {
    this.aliases.forEach((alias) => {
      alias.aliases.forEach((aliasText: string) => {
        this.searchMap[aliasText] = this.searchMap[aliasText] || [];
        this.searchMap[aliasText].push(alias.song_id);
      })
    })
  }

  async fetch() {
    const res = await fetchAPI(`${this.game}/alias/list`, { method: "GET" });
    const data = await res?.json();
    this.aliases = data.aliases;
    this.parseSearchMap();

    return this.aliases;
  }
}