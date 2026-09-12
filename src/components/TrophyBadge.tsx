import {
  Badge,
  BadgeProps,
  darken,
  ElementProps,
  rem,
  rgba,
  Text,
  MantineSize,
} from "@mantine/core";
import { Marquee } from "@/components/Marquee.tsx";
import { getTrophyColor } from "@/utils/color.ts";

interface TrophyBadgeProps extends BadgeProps, ElementProps<"div", keyof BadgeProps> {
  name: string;
  trophyColor: string;
  fontSize?: MantineSize;
}

export const TrophyBadge = ({
  name,
  trophyColor: color,
  fontSize = "xs",
  ...others
}: TrophyBadgeProps) => {
  const resolvedColor = getTrophyColor(color);
  const background =
    color.toLowerCase() === "ultima"
      ? `linear-gradient(90deg, ${rgba("#FF2854", 0.28)} 0%, ${rgba(resolvedColor, 0.1)} 12%, ${rgba(resolvedColor, 0.1)} 88%, ${rgba("#FF2854", 0.28)} 100%)`
      : rgba(resolvedColor, 0.1);

  return (
    <Badge
      radius={rem(10)}
      style={{
        background,
        color: darken(resolvedColor, 0.1),
        cursor: "inherit",
      }}
      {...others}
    >
      <Marquee>
        <Text fz={fontSize} style={{ whiteSpace: "pre-wrap" }}>
          {name}
        </Text>
      </Marquee>
    </Badge>
  );
};
