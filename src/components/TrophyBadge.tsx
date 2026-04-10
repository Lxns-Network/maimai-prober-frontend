import { Badge, BadgeProps, darken, ElementProps, rem, rgba, Text, MantineSize } from "@mantine/core";
import { Marquee } from "@/components/Marquee.tsx";
import { getTrophyColor } from "@/utils/color.ts";

interface TrophyBadgeProps extends BadgeProps, ElementProps<'div', keyof BadgeProps> {
  name: string;
  trophyColor: string;
  fontSize?: MantineSize;
}

export const TrophyBadge = ({ name, trophyColor: color, fontSize = "xs", ...others }: TrophyBadgeProps) => {
  const resolvedColor = getTrophyColor(color);

  return (
    <Badge
      radius={rem(10)}
      style={{
        background: rgba(resolvedColor, 0.1),
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
