import { ActionIcon, Center, Loader, Text } from "@mantine/core";
import { useInViewport, useReducedMotion } from "@mantine/hooks";
import { IconPlayerPause, IconPlayerPlay } from "@tabler/icons-react";
import { lazy, Suspense, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import classes from "./ChartPreview.module.css";

const ChartPreviewCanvas = lazy(() => import("./ChartPreviewCanvas"));

export function ChartPreview() {
  const { ref, inViewport } = useInViewport<HTMLDivElement>();
  const reducedMotion = useReducedMotion();
  const [playPreference, setPlayPreference] = useState<boolean | null>(null);
  const playing = inViewport && (playPreference ?? !reducedMotion);

  return (
    <div ref={ref} className={classes.preview}>
      <div className={classes.frame}>
        <div className={classes.stage}>
          {inViewport && (
            <ErrorBoundary
              fallback={
                <Center h="100%">
                  <Text size="xs" c="gray.4">
                    预览暂时不可用
                  </Text>
                </Center>
              }
            >
              <Suspense
                fallback={
                  <Center h="100%">
                    <Loader size="sm" color="violet" />
                  </Center>
                }
              >
                <ChartPreviewCanvas playing={playing} />
              </Suspense>
            </ErrorBoundary>
          )}
        </div>
        <ActionIcon
          className={classes.playback}
          variant="default"
          radius="xl"
          size="md"
          aria-label={playing ? "暂停谱面预览" : "播放谱面预览"}
          onClick={() => setPlayPreference(!playing)}
        >
          {playing ? <IconPlayerPause size={15} /> : <IconPlayerPlay size={15} />}
        </ActionIcon>
      </div>
    </div>
  );
}
