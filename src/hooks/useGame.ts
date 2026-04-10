import { Game } from "@/types/game";
import { useLocalStorage } from "@mantine/hooks";
import { usePageContext } from "vike-react/usePageContext";

const validGames = ["maimai", "chunithm"];

// 记录已应用过 URL game 参数的 pathname，避免重复覆盖
let appliedUrlGameFor: string | null = null;

function useGame(defaultGame: Game = 'maimai'): [Game, (game: Game) => void] {
  const pageContext = usePageContext();
  const searchParams = new URLSearchParams(pageContext.urlParsed.search);
  const gameFromSearch = searchParams.get("game");
  const gameFromUrl = validGames.includes(gameFromSearch || "") ? (gameFromSearch as Game) : null;

  // URL 的 game 参数仅在首次加载该页面时应用一次
  if (gameFromUrl && typeof window !== 'undefined' && appliedUrlGameFor !== pageContext.urlPathname) {
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
