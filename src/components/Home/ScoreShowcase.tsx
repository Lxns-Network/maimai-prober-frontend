import { Center, Loader, Text } from "@mantine/core";
import { useElementSize, useInViewport } from "@mantine/hooks";
import { lazy, Suspense, useState, type ReactNode } from "react";
import { ErrorBoundary } from "react-error-boundary";
import classes from "./ScoreShowcase.module.css";

const ScoreListScene = lazy(() =>
  import("./ScoreShowcaseScenes").then((module) => ({ default: module.ScoreListScene })),
);
const ScoreDetailScene = lazy(() =>
  import("./ScoreShowcaseScenes").then((module) => ({ default: module.ScoreDetailScene })),
);

/** 场景按此逻辑宽度渲染，宽度铺满槽位；逻辑高度由槽位剩余高度反推，因此高度是自适应的。 */
const SCENE_WIDTH = 390;

function ScaledFrame({ title, children }: { title: string; children: ReactNode }) {
  const { ref, width, height } = useElementSize<HTMLDivElement>();
  const scale = width > 0 ? width / SCENE_WIDTH : 0;
  const sceneHeight = scale > 0 ? height / scale : 0;

  return (
    <div className={classes.figure}>
      <div className={classes.slot}>
        <div ref={ref} className={classes.frame} role="img" aria-label={`${title}界面，示例数据`}>
          <div
            className={classes.stage}
            inert
            aria-hidden
            style={{
              width: SCENE_WIDTH,
              height: sceneHeight,
              transform: `scale(${scale})`,
              visibility: scale > 0 ? "visible" : "hidden",
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function Scene({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={
        <Center h="100%">
          <Text size="xs" c="dimmed">
            预览暂时不可用
          </Text>
        </Center>
      }
    >
      <Suspense
        fallback={
          <Center h="100%">
            <Loader size="sm" />
          </Center>
        }
      >
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

export function ScoreShowcase() {
  const { ref, inViewport } = useInViewport<HTMLDivElement>();
  const [revealed, setRevealed] = useState(false);
  if (inViewport && !revealed) setRevealed(true);

  const scenes = [
    { title: "成绩列表", scene: <ScoreListScene /> },
    { title: "成绩详情", scene: <ScoreDetailScene /> },
  ];

  return (
    <div
      ref={ref}
      className={classes.showcase}
      role="group"
      aria-label="成绩管理界面示例，使用模拟数据"
    >
      {scenes.map(({ title, scene }) => (
        <ScaledFrame key={title} title={title}>
          {revealed && <Scene>{scene}</Scene>}
        </ScaledFrame>
      ))}
    </div>
  );
}
