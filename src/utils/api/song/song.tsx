export class SongList {
  songs: any[] = [];

  constructor() {
    this.songs = [];
  }

  async fetch() {
    return this.songs;
  }

  push(...songs: any[]) {
    this.songs.push(...songs);
  }

  find(id: number) {
    return this.songs.find((song: any) => song.id === id);
  }

  clear() {
    this.songs = [];
  }

  get length() {
    return this.songs.length;
  }

  getDifficulty(song: any, ...args: any[]) {
    return song.difficulties[args[0]][args[1]];
  }
}