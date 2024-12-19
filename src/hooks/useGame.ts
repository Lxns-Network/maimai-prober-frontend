import { Game } from "@/types/game";
import { useLocalStorage } from "@mantine/hooks";
import { useSearchParams } from "react-router-dom";

function useGame(defaultGame: Game = 'maimai'): [Game, (game: Game) => void] {
  const [searchParams] = useSearchParams();

  const gameFromSearch = searchParams.get("game");
  const validGames = ["maimai", "chunithm"];
  const gameFromStorage = localStorage.getItem("game");

  const initialGame: Game =
    validGames.includes(gameFromSearch || "") ? (gameFromSearch as Game) :
      (gameFromStorage ? (JSON.parse(gameFromStorage) as Game) : defaultGame);

  if (initialGame !== gameFromStorage) {
    localStorage.setItem("game", JSON.stringify(initialGame));
  }

  const [game, setGame] = useLocalStorage<Game>({
    key: "game",
    defaultValue: initialGame,
  });

  return [game, setGame];
}

export default useGame;
