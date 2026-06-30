import {
  Accordion,
  Badge,
  Center,
  Group,
  Image,
  Paper,
  Stack,
  Text,
} from "@mantine/core";
import { DataTable, DataTableColumn } from "mantine-datatable";
import classes from "./RatingConstantAnalysis.module.css";
import { ChunithmBestsProps, MaimaiBestsProps } from "@/types/score";
import {
  requiredChunithmConstant,
  requiredMaimaiConstant,
} from "@/utils/rating.ts";
import { getDeluxeRatingGradient, getRatingGradient } from "@/utils/color.ts";

interface AnalysisRow {
  label: string;
  rating: string;
  values: string[];
}

interface AnalysisSegment {
  title: string;
  avg: string;
  total: string;
  rows: AnalysisRow[];
}

function truncate2(value: number): number {
  return Math.floor(value * 100) / 100;
}

function truncate2Average(values: number[]): number {
  if (values.length === 0) return 0;
  return truncate2(
    values.reduce((acc, v) => acc + truncate2(v), 0) / values.length,
  );
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((acc, v) => acc + truncate2(v), 0) / values.length;
}

function isMaimaiBests(
  bests: MaimaiBestsProps | ChunithmBestsProps,
): bests is MaimaiBestsProps {
  return "standard_total" in bests && "dx_total" in bests;
}

// 达成率/分数档（图片 id 与 /assets/{game}/music_rank/ 下的资源一致）。
const MAIMAI_RANKS = [
  { id: "sssp", achievement: 100.5 },
  { id: "sss", achievement: 100 },
  { id: "ssp", achievement: 99.5 },
  { id: "ss", achievement: 99 },
];

const CHUNITHM_RANKS = [
  { id: "sssp", offset: 2.15 },
  { id: "sss", offset: 2.0 },
  { id: "ssp", offset: 1.5 },
  { id: "ss", offset: 1.0 },
];

export function RatingConstantAnalysis({
  bests,
}: {
  bests: MaimaiBestsProps | ChunithmBestsProps;
}) {
  const maimai = isMaimaiBests(bests);
  const ranks = maimai ? MAIMAI_RANKS : CHUNITHM_RANKS;
  const maxConstant = maimai ? 15 : 16;
  const fmtRating = (r: number) =>
    maimai ? String(Math.round(r)) : truncate2(r).toFixed(2);
  const requiredFor = (rating: number, index: number) =>
    maimai
      ? requiredMaimaiConstant(rating, MAIMAI_RANKS[index].achievement)
      : requiredChunithmConstant(rating, CHUNITHM_RANKS[index].offset);
  const rankImage = (id: string) =>
    maimai
      ? `/assets/maimai/music_rank/${id}.webp`
      : `/assets/chunithm/music_rank/${id}_s.webp`;

  const buildSegment = (
    title: string,
    ratings: number[],
    totalRaw: number,
  ): AnalysisSegment => {
    const max = ratings.length > 0 ? ratings[0] : 0;
    const min = ratings.length > 0 ? ratings[ratings.length - 1] : 0;
    const buildRow = (label: string, rating: number): AnalysisRow => ({
      label,
      rating: fmtRating(rating),
      values: ranks.map((_, index) => {
        const required = requiredFor(rating, index);
        return rating > 0 && required <= maxConstant
          ? required.toFixed(1)
          : "-";
      }),
    });
    return {
      title,
      avg: fmtRating(truncate2Average(ratings)),
      total: maimai
        ? String(Math.round(totalRaw))
        : truncate2(totalRaw).toFixed(2),
      rows: [buildRow("最高", max), buildRow("最低", min)],
    };
  };

  const segments: AnalysisSegment[] = [];
  let total = 0;

  if (isMaimaiBests(bests)) {
    if (bests.dx) {
      segments.push(
        buildSegment(
          "BEST 15",
          bests.dx.map((s) => s.dx_rating),
          bests.dx_total,
        ),
      );
    }
    if (bests.standard) {
      segments.push(
        buildSegment(
          "BEST 35",
          bests.standard.map((s) => s.dx_rating),
          bests.standard_total,
        ),
      );
    }
    total = bests.standard_total + bests.dx_total;
  } else {
    const sum = (scores?: ChunithmBestsProps["bests"]) =>
      (scores ?? []).reduce((acc, s) => acc + truncate2(s.rating), 0);
    if (bests.bests) {
      segments.push(
        buildSegment(
          "BEST 30",
          bests.bests.map((s) => s.rating),
          sum(bests.bests),
        ),
      );
    }
    if (bests.selections) {
      segments.push(
        buildSegment(
          "SELECTION 10",
          bests.selections.map((s) => s.rating),
          sum(bests.selections),
        ),
      );
    }
    if (bests.new_bests) {
      segments.push(
        buildSegment(
          "NEW 20",
          bests.new_bests.map((s) => s.rating),
          sum(bests.new_bests),
        ),
      );
    }
    const b30avg = average((bests.bests ?? []).map((s) => s.rating));
    const n20avg = average((bests.new_bests ?? []).map((s) => s.rating));
    const b30count = +(bests.bests?.length ?? 0);
    const n20count = +(bests.new_bests?.length ?? 0);
    const bestsCount = b30count + n20count;
    total = truncate2(
      b30avg * (b30count / bestsCount) + n20avg * (n20count / bestsCount),
    );
  }

  const columns: DataTableColumn<AnalysisRow>[] = [
    {
      accessor: "label",
      title: "定数分析",
      noWrap: true,
      render: (row) => (
        <Text fw={500} fz="sm">
          {row.label}
        </Text>
      ),
    },
    { accessor: "rating", title: "RATING", textAlign: "center" },
    ...ranks.map((rank, index): DataTableColumn<AnalysisRow> => ({
      accessor: `v${index}`,
      title: (
        <Center>
          <Image src={rankImage(rank.id)} h={20} w="auto" alt={rank.id} />
        </Center>
      ),
      textAlign: "center",
      render: (row) => row.values[index],
    })),
  ];

  const gradient = maimai
    ? getDeluxeRatingGradient(total)
    : getRatingGradient(total);

  return (
    <Paper withBorder radius="md" style={{ overflow: "hidden" }}>
      <Stack align="center" gap={4} p="md">
        <Text fw={500}>{maimai ? "DX 评分总和" : "Rating 均值"}</Text>
        <Badge
          variant="gradient"
          gradient={gradient}
          size="xl"
          style={{
            fontSize: "var(--mantine-h2-font-size)",
            fontWeight: 700,
            lineHeight: "var(--mantine-h2-line-height)",
          }}
        >
          {total}
        </Badge>
      </Stack>
      <Accordion multiple styles={{ content: { padding: 0 } }}>
        {segments.map((segment, index) => (
          <Accordion.Item
            key={segment.title}
            value={segment.title}
            className={
              index === segments.length - 1 ? classes.lastItem : undefined
            }
          >
            <Accordion.Control>
              <Group justify="space-between" wrap="nowrap" pr="md">
                <Text fw={700}>{segment.title}</Text>
                <Group gap="md" wrap="nowrap">
                  <Text c="dimmed" fz="sm">
                    平均 {segment.avg}
                  </Text>
                  {maimai && (
                    <Text c="dimmed" fz="sm">
                      合计 {segment.total}
                    </Text>
                  )}
                </Group>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <DataTable
                fz="sm"
                highlightOnHover
                striped
                verticalSpacing="xs"
                horizontalSpacing="md"
                idAccessor="label"
                columns={columns}
                records={segment.rows}
              />
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    </Paper>
  );
}
