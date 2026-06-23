import { navigate } from "vike/client/router";
import useGame from "@/hooks/useGame.ts";
import useScoreStore from "@/hooks/useScoreStore.ts";
import { fetchAPI } from "@/utils/api/api.ts";
import { openAlertModal } from "@/utils/modal.tsx";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import { NotificationAction } from "@/types/notification";

export function useNotificationAction() {
  const [, setGame] = useGame();
  const openScoreModal = useScoreStore((state) => state.openModal);

  return async (action?: NotificationAction): Promise<void> => {
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
      return;
    }

    if (action.type === "score") {
      setGame(action.game);
      const params = new URLSearchParams({ song_id: String(action.song_id) });
      if (action.song_type) params.append("song_type", action.song_type);

      try {
        const res = await fetchAPI(`user/${action.game}/player/bests?${params.toString()}`, {
          method: "GET",
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.message);

        const scores = (data.data ?? []) as (MaimaiScoreProps | ChunithmScoreProps)[];
        const score = scores.find(
          (s) =>
            s.level_index === action.difficulty &&
            (!action.song_type || !("type" in s) || s.type === action.song_type),
        );

        if (!score) {
          openAlertModal("成绩不存在", "目标成绩可能已被删除或尚未上传。");
          return;
        }
        openScoreModal({ game: action.game, score });
      } catch (e) {
        openAlertModal("打开成绩失败", `${e}`);
      }
    }
  };
}
