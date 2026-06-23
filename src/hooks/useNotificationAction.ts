import { navigate } from "vike/client/router";
import useGame from "@/hooks/useGame.ts";
import { NotificationAction } from "@/types/notification";

export function useNotificationAction() {
  const [, setGame] = useGame();

  return (action?: NotificationAction): void => {
    if (!action) return;

    if (action.type === "link") {
      if (action.url.startsWith("http")) {
        window.open(action.url, "_blank", "noopener");
      } else {
        navigate(action.url);
      }
      return;
    }

    if (action.type === "song") {
      setGame(action.game);
      navigate(`/songs?game=${action.game}&song_id=${action.song_id}`);
    }
  };
}
