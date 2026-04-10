import { Game } from "@/types/game";
import { useLocalStorage } from "@mantine/hooks";
import { usePageContext } from "vike-react/usePageContext";

function useGame(defaultGame: Game = 'maimai'): [Game, (game: Game) => void] {
  const pageContext = usePageContext();
  const searchParams = new URLSearchParams(pageContext.urlParsed.search);

  const isBrowser = typeof window !== 'undefined';
  const gameFromSearch = searchParams.get("game");
  const validGames = ["maimai", "chunithm"];
  const rawGameFromStorage = isBrowser ? localStorage.getItem("game") : null;
  let gameFromStorage: Game | null = null;
  if (rawGameFromStorage) {
    try {
      const parsed = JSON.parse(rawGameFromStorage);
      if (validGames.includes(parsed)) {
        gameFromStorage = parsed as Game;
      }
    } catch {
      if (validGames.includes(rawGameFromStorage)) {
        gameFromStorage = rawGameFromStorage as Game;
      }
    }
  }

  const initialGame: Game =
    validGames.includes(gameFromSearch || "") ? (gameFromSearch as Game) :
      (gameFromStorage ?? defaultGame);

  const [game, setGame] = useLocalStorage<Game>({
    key: "game",
    defaultValue: initialGame,
  });

  return [game, setGame];
}

export default useGame;
