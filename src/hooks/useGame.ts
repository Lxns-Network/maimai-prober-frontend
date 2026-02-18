import { Game } from "@/types/game";
import { useLocalStorage } from "@mantine/hooks";
import { usePageContext } from "vike-react/usePageContext";

function useGame(defaultGame: Game = 'maimai'): [Game, (game: Game) => void] {
  const pageContext = usePageContext();
  const searchParams = new URLSearchParams(pageContext.urlParsed.search);

  const isBrowser = typeof window !== 'undefined';
  const gameFromSearch = searchParams.get("game");
  const validGames = ["maimai", "chunithm"];
  const gameFromStorage = isBrowser ? localStorage.getItem("game") : null;

  const initialGame: Game =
    validGames.includes(gameFromSearch || "") ? (gameFromSearch as Game) :
      (gameFromStorage ? (JSON.parse(gameFromStorage) as Game) : defaultGame);

  if (isBrowser && initialGame !== gameFromStorage) {
    localStorage.setItem("game", JSON.stringify(initialGame));
  }

  const [game, setGame] = useLocalStorage<Game>({
    key: "game",
    defaultValue: initialGame,
  });

  return [game, setGame];
}

export default useGame;
