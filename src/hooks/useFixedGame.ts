import { useState } from "react";
import { Game } from "@/types/game";

function readStoredGame(defaultGame: Game): Game {
  try {
    const storedGame = localStorage.getItem("game");
    if (!storedGame) return defaultGame;
    const parsed = JSON.parse(storedGame) as unknown;
    return parsed === "maimai" || parsed === "chunithm" ? parsed : defaultGame;
  } catch {
    return defaultGame;
  }
}

function useFixedGame(defaultGame: Game = "maimai"): [Game, (game: Game) => void] {
  const [game, setGame] = useState(() => {
    return readStoredGame(defaultGame);
  });

  return [game, setGame];
}

export default useFixedGame;
