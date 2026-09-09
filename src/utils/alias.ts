import { AliasProps } from "@/types/alias";
import { match, P } from "ts-pattern";

export function calculateNewAliasWeight(
  alias: AliasProps,
  vote: boolean, // true: 支持, false: 反对
): AliasProps {
  let { up, down, total } = alias.weight;
  const current = alias.vote?.weight ?? 0;
  const isUpvote = vote;

  if (current === 0) {
    if (isUpvote) {
      up++;
      total++;
    } else {
      down++;
      total++;
    }
  } else if (current === 1) {
    if (isUpvote) {
      up--;
      total--;
    } // 取消支持
    else {
      up--;
      down++;
    } // 改为反对
  } else if (current === -1) {
    if (!isUpvote) {
      down--;
      total--;
    } // 取消反对
    else {
      down--;
      up++;
    } // 改为支持
  }

  const newWeight = match([current, isUpvote] as const)
    .with([1, true], () => 0)
    .with([-1, false], () => 0)
    .with([P._, true], () => 1)
    .otherwise(() => -1);

  return {
    ...alias,
    weight: { up: Math.max(0, up), down: Math.max(0, down), total: Math.max(0, total) },
    vote: {
      ...alias.vote,
      weight: newWeight,
    },
  };
}
