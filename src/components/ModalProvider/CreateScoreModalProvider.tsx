import useCreateScoreStore from "@/hooks/useCreateScoreStore.ts";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import { Modal } from "@mantine/core";
import { useBackDismiss } from "@/hooks/useBackDismiss.ts";
import { lazy, Suspense, useEffect, useState } from "react";
import { Game } from "@/types/game";

const MaimaiCreateScoreContent = lazy(() =>
  import("../Scores/maimai/CreateScoreModal.tsx").then(({ MaimaiCreateScoreContent }) => ({
    default: MaimaiCreateScoreContent,
  })),
);
const ChunithmCreateScoreModalContent = lazy(() =>
  import("../Scores/chunithm/CreateScoreModal.tsx").then(({ ChunithmCreateScoreModalContent }) => ({
    default: ChunithmCreateScoreModalContent,
  })),
);

export function CreateScoreModalProvider() {
  const { opened, game, score, closeModal } = useCreateScoreStore();
  const [activatedGames, setActivatedGames] = useState<Set<Game>>(() => new Set());

  useEffect(() => {
    if (!opened) return;
    setActivatedGames((current) => {
      if (current.has(game)) return current;
      const next = new Set(current);
      next.add(game);
      return next;
    });
  }, [game, opened]);

  useBackDismiss(opened, closeModal);

  return (
    <Modal.Root
      opened={opened}
      onClose={closeModal}
      onExitTransitionEnd={() => {
        useCreateScoreStore.setState({
          score: null,
        });
      }}
      centered
    >
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>创建成绩</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body>
          <Suspense fallback={null}>
            {game === "maimai" && (opened || activatedGames.has("maimai")) && (
              <MaimaiCreateScoreContent
                score={score as MaimaiScoreProps}
                onSubmit={(values) => closeModal(values)}
                onClose={closeModal}
              />
            )}
            {game === "chunithm" && (opened || activatedGames.has("chunithm")) && (
              <ChunithmCreateScoreModalContent
                score={score as ChunithmScoreProps}
                onSubmit={(values) => closeModal(values)}
                onClose={closeModal}
              />
            )}
          </Suspense>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
