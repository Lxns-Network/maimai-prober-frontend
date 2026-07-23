import { fetchAPI } from "./api.ts";

export async function createAlias(game: string, data: object): Promise<Response> {
  return fetchAPI(`user/${game}/alias`, { method: "POST", body: data });
}

export async function voteAlias(game: string, aliasId: number, vote: boolean): Promise<Response> {
  return fetchAPI(`user/${game}/alias/${aliasId}/vote/${vote ? "up" : "down"}`, { method: "POST" });
}

export async function deleteUserAlias(game: string, aliasId: number): Promise<Response> {
  return fetchAPI(`user/${game}/alias/${aliasId}`, { method: "DELETE" });
}

export async function deleteAlias(game: string, aliasId: number): Promise<Response> {
  return fetchAPI(`user/admin/${game}/alias/${aliasId}`, { method: "DELETE" });
}

export async function approveAlias(game: string, aliasId: number): Promise<Response> {
  return fetchAPI(`user/admin/${game}/alias/${aliasId}/approve`, { method: "POST" });
}

interface AliasEntry {
  song_id: number;
  aliases: string[];
}

export class AliasList {
  game: string = "";
  aliases: AliasEntry[] = [];
  searchMap: Record<string, number[]> = {};

  constructor(game: string) {
    this.game = game;
  }

  private parseSearchMap() {
    this.searchMap = {};
    this.aliases.forEach((alias) => {
      alias.aliases.forEach((aliasText: string) => {
        this.searchMap[aliasText] = this.searchMap[aliasText] || [];
        this.searchMap[aliasText].push(alias.song_id);
      });
    });
  }

  async fetch() {
    const res = await fetchAPI(`${this.game}/alias/list`, { method: "GET" });
    if (!res.ok) throw new Error(`别名列表请求失败：${res.status}`);

    const data = (await res.json()) as { aliases?: AliasEntry[] };
    if (!Array.isArray(data.aliases)) throw new Error("别名列表响应格式无效");

    this.aliases = data.aliases;
    this.parseSearchMap();

    return this.aliases;
  }
}
