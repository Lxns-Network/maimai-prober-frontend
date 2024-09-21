import { MaimaiSongList } from "./maimai.ts";
import { ChunithmSongList } from "./chunithm.ts";

export class SongList {
  maimai: MaimaiSongList;
  chunithm: ChunithmSongList;

  constructor() {
    this.maimai = new MaimaiSongList();
    this.chunithm = new ChunithmSongList();
  }

  async fetch() {
    await this.maimai.fetch();
    await this.chunithm.fetch();
  }
}