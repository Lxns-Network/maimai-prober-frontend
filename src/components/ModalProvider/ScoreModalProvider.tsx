import useScoreStore from "@/hooks/useScoreStore.ts";
import { useBackDismiss } from "@/hooks/useBackDismiss.ts";
import { Center, Loader, Modal } from "@mantine/core";
import { lazy, Suspense, useEffect, useState } from "react";

const ScoreModal = lazy(() =>
  import("../Scores/ScoreModal.tsx").then(({ ScoreModal }) => ({ default: ScoreModal })),
);

export function ScoreModalProvider() {
  const { opened, game, score, closeModal } = useScoreStore();
  const [activated, setActivated] = useState(false);
  const { navigateFromOverlay } = useBackDismiss(opened, () => closeModal());

  useEffect(() => {
    if (opened) setActivated(true);
  }, [opened]);

  if (!opened && !activated) return null;

  return (
    <Suspense
      fallback={
        <Modal opened={opened} onClose={() => closeModal()} title="成绩详情" centered>
          <Center py="xl">
            <Loader />
          </Center>
        </Modal>
      }
    >
      <ScoreModal
        game={game}
        score={score}
        opened={opened}
        onClose={(score) => closeModal(score)}
        navigateFromOverlay={navigateFromOverlay}
      />
    </Suspense>
  );
}
