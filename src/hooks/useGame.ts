import { Game } from "@/types/game";
import { useLocalStorage } from "@mantine/hooks";
import { usePageContext } from "vike-react/usePageContext";

const validGames = ["maimai", "chunithm"];

// 记录已应用过 URL game 参数的 pathname，避免重复覆盖
let appliedUrlGameFor: string | null = null;

/**
 * 读取并持久化当前游戏（maimai / chunithm），值存于 localStorage 的 `game`。
 *
 * 副作用：首次加载某个 pathname 时，若 URL 带有合法的 `?game=` 参数，会把它写入
 * localStorage（每个 pathname 仅应用一次，覆盖原值）。返回的 setter 同样写入 localStorage。
 */
function useGame(defaultGame: Game = "maimai"): [Game, (game: Game) => void] {
  const pageContext = usePageContext();
  const searchParams = new URLSearchParams(pageContext.urlParsed.search);
  const gameFromSearch = searchParams.get("game");
  const gameFromUrl = validGames.includes(gameFromSearch || "") ? (gameFromSearch as Game) : null;

  // URL 的 game 参数仅在首次加载该页面时应用一次
  if (
    gameFromUrl &&
    typeof window !== "undefined" &&
    appliedUrlGameFor !== pageContext.urlPathname
  ) {
    appliedUrlGameFor = pageContext.urlPathname;
    const stored = localStorage.getItem("game");
    if (stored !== JSON.stringify(gameFromUrl)) {
      localStorage.setItem("game", JSON.stringify(gameFromUrl));
    }
  }

  const [game, setGame] = useLocalStorage<Game>({
    key: "game",
    defaultValue: gameFromUrl ?? defaultGame,
  });

  return [game, setGame];
}

export default useGame;
