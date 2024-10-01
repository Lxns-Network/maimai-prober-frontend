import { useState } from "react";
import { Game } from "@/types/game";

function useFixedGame(defaultGame = 'maimai'): [Game, (game: Game) => void] {
  const [game, setGame] = useState(() => {
    const storedGame = localStorage.getItem('game');
    return storedGame ? JSON.parse(storedGame) : defaultGame;
  });

  return [game, setGame];
}

export default useFixedGame;