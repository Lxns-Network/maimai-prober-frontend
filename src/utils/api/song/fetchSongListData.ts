import { notifications } from "@mantine/notifications";
import { Game } from "@/types/game";
import { APIError } from "@/utils/errors.ts";
import { fetchAPI } from "../api.ts";

interface SongListData {
  songs: unknown[];
  genres: unknown[];
  versions: unknown[];
}

function isSongListData(data: unknown): data is SongListData {
  if (!data || typeof data !== "object") return false;
  const list = data as Partial<SongListData>;
  return (
    Array.isArray(list.songs) &&
    list.songs.length > 0 &&
    Array.isArray(list.genres) &&
    Array.isArray(list.versions)
  );
}

/**
 * 按资源 hash 读取缓存，缓存损坏或不可读时重新请求。缓存写入失败不影响返回的数据。
 * @throws {APIError} HTTP 请求失败或曲目列表结构无效。
 */
export async function fetchSongListData<T extends SongListData>(
  game: Game,
  hash?: string,
): Promise<T> {
  try {
    if (hash && localStorage.getItem(`${game}_songs_hash`) === hash) {
      const cached: unknown = JSON.parse(localStorage.getItem(`${game}_songs`) || "null");
      if (isSongListData(cached)) return cached as T;
    }
  } catch {
    // 缓存不可用时继续请求资源。
  }

  const response = await fetchAPI(`${game}/song/list`, { method: "GET" });
  if (!response.ok) {
    throw new APIError("获取曲目列表失败", { status: response.status });
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new APIError("服务器返回了无效的曲目列表", { status: response.status });
  }
  if (!isSongListData(data)) {
    throw new APIError("服务器返回了无效的曲目列表", { status: response.status });
  }

  try {
    localStorage.setItem(`${game}_songs`, JSON.stringify(data));
    localStorage.setItem(`${game}_songs_hash`, hash || "");
  } catch {
    // 存储空间不足时仍允许使用已下载的数据。
  }

  notifications.show({
    title: "已更新曲目列表",
    message: `已获取最新的「${game === "maimai" ? "舞萌 DX" : "中二节奏"}」曲目列表。`,
  });
  return data as T;
}
