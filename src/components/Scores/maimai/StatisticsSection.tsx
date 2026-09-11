import {
  Card,
  Grid,
  Image,
  rem,
  Text,
  Group,
  Spoiler,
  Divider,
  NumberFormatter,
  Flex,
  Box,
} from "@mantine/core";
import classes from "./StatisticsSection.module.css";
import { useMediaQuery } from "@mantine/hooks";
import { MaimaiScoreProps } from "@/types/score";

const RateStatistics = ({ scores }: { scores: MaimaiScoreProps[] }) => {
  const rate = [
    { id: "sssp", min: 100.5, max: Infinity },
    { id: "sss", min: 100, max: 100.5 },
    { id: "ssp", min: 99.5, max: 100 },
    { id: "ss", min: 99, max: 99.5 },
    { id: "sp", min: 98, max: 99 },
    { id: "s", min: 97, max: 98 },
    { id: "aaa", min: 94, max: 97 },
    { id: "aa", min: 90, max: 94 },
    { id: "a", min: 80, max: 90 },
  ];

  function calculateCount(
    scores: MaimaiScoreProps[],
    minAchievements: number,
    maxAchievements: number,
  ) {
    return scores.filter(
      (score) => score.achievements >= minAchievements && score.achievements < maxAchievements,
    ).length;
  }

  return (
    <Box w="100%">
      {rate.map((r, index) => {
        let count = calculateCount(scores, r.min, r.max);
        for (let i = 0; i < index; i++) {
          count += calculateCount(scores, rate[i].min, rate[i].max);
        }
        return (
          <Group key={r.id} mb="xs" wrap="nowrap">
            <Image src={`/assets/maimai/music_rank/${r.id}.webp`} h={30} w="auto" />
            <Divider style={{ flex: 1 }} variant="dashed" />
            <Text fz={20} style={{ lineHeight: rem(20) }}>
              <NumberFormatter value={count} thousandSeparator />
              <span style={{ fontSize: 16, marginLeft: 4 }}>
                / <NumberFormatter value={scores.length} thousandSeparator />
              </span>
            </Text>
          </Group>
        );
      })}
    </Box>
  );
};

const FullComboStatistics = ({ scores }: { scores: MaimaiScoreProps[] }) => {
  const fc = ["app", "ap", "fcp", "fc"];

  return (
    <Box w="100%">
      {fc.map((r, index) => (
        <Group key={r} mb="xs" h={30} wrap="nowrap">
          <Image src={`/assets/maimai/music_icon/${r}.webp`} h={30} w="auto" />
          <Divider style={{ flex: 1 }} variant="dashed" />
          <Text fz={20} style={{ lineHeight: rem(20) }}>
            <NumberFormatter
              value={
                scores.filter((score) => {
                  return fc.slice(0, index + 1).includes(score.fc);
                }).length
              }
              thousandSeparator
            />
            <span style={{ fontSize: 16, marginLeft: 4 }}>
              / <NumberFormatter value={scores.length} thousandSeparator />
            </span>
          </Text>
        </Group>
      ))}
    </Box>
  );
};

const FullSyncStatistics = ({ scores }: { scores: MaimaiScoreProps[] }) => {
  const fs = ["fsdp", "fsd", "fsp", "fs"];

  return (
    <Box w="100%">
      {fs.map((r, index) => (
        <Group key={r} mb="xs" h={30} wrap="nowrap">
          <Image src={`/assets/maimai/music_icon/${r}.webp`} h={30} w="auto" />
          <Divider style={{ flex: 1 }} variant="dashed" />
          <Text fz={20} style={{ lineHeight: rem(20) }}>
            <NumberFormatter
              value={
                scores.filter((score) => {
                  return fs.slice(0, index + 1).includes(score.fs);
                }).length
              }
              thousandSeparator
            />
            <span style={{ fontSize: 16, marginLeft: 4 }}>
              / <NumberFormatter value={scores.length} thousandSeparator />
            </span>
          </Text>
        </Group>
      ))}
    </Box>
  );
};

/**
 * `collapsible` 为假时完整展开，供本身篇幅有限的页面（如好友名片）直接铺开显示。
 * `className` 透传到外层 `Card`，供需要统一卡片底色的页面覆盖表面样式。
 */
export const MaimaiStatisticsSection = ({
  scores,
  collapsible = true,
  className,
}: {
  scores: MaimaiScoreProps[];
  collapsible?: boolean;
  className?: string;
}) => {
  const small = useMediaQuery("(max-width: 30rem)");
  const extraSmall = useMediaQuery("(max-width: 28rem)");

  const statistics = (
    <Grid gap={small ? "md" : "xl"}>
      <Grid.Col span={extraSmall ? 12 : 6}>
        <RateStatistics scores={scores} />
      </Grid.Col>
      <Grid.Col span={extraSmall ? 12 : 6}>
        <Flex className={classes.fullComboSyncSection} gap="md">
          <FullComboStatistics scores={scores} />
          <FullSyncStatistics scores={scores} />
        </Flex>
      </Grid.Col>
    </Grid>
  );

  return (
    <Card className={className} withBorder radius="md">
      {collapsible ? (
        <Spoiler maxHeight={120} showLabel="显示详细统计信息..." hideLabel="隐藏详细统计信息">
          {statistics}
        </Spoiler>
      ) : (
        statistics
      )}
    </Card>
  );
};
