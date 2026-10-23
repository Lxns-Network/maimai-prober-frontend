import { Tooltip } from "@mantine/core";
import { IconDiscountCheckFilled } from "@tabler/icons-react";

interface VerifiedBadgeProps {
  size?: number;
}

export const VerifiedBadge = ({ size = 16 }: VerifiedBadgeProps) => (
  <Tooltip label="已验证的应用" withArrow>
    <IconDiscountCheckFilled
      size={size}
      aria-label="已验证的应用"
      role="img"
      style={{ color: "var(--mantine-color-blue-filled)", flexShrink: 0 }}
    />
  </Tooltip>
);
