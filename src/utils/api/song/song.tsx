import { MaimaiSongList } from "./maimai.tsx";
import { ChunithmSongList } from "./chunithm.tsx";

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