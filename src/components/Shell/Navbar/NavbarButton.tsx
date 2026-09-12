import { Badge, Group, Indicator, Text } from "@mantine/core";
import React from "react";
import classes from "./Navbar.module.css";
import { navigate } from "vike/client/router";

interface NavbarButtonProps {
  label: string;
  icon: React.ReactNode;
  is_new?: boolean;
  count?: number;
  dot?: boolean;
  to?: string;
  active?: string;
  onClose(): void;
  onClick?(): void;
}

export const NavbarButton = ({
  label,
  icon,
  is_new,
  count,
  dot,
  to,
  active,
  onClose,
  onClick,
}: NavbarButtonProps) => {
  // `count` 优先于 `dot`：有条数就显示数字角标，否则只按 `dot` 显示红点。
  const indicatorProps =
    count === undefined
      ? { size: 8, disabled: !dot }
      : { size: 16, disabled: !count, label: count > 99 ? "99+" : count };

  return (
    <a
      href={to}
      key={label}
      className={classes.navbarLink}
      data-active={label === active || undefined}
      onClick={(event) => {
        event.preventDefault();
        onClick && onClick();
        if (to) navigate(to);
        onClose();
      }}
    >
      <Group>
        <Indicator color="red" {...indicatorProps}>
          <div className={classes.navbarLinkIcon}>{icon}</div>
        </Indicator>
        <Text size="sm">{label}</Text>
        {is_new && (
          <Badge
            color="red"
            variant="light"
            style={{
              cursor: "pointer",
            }}
          >
            New
          </Badge>
        )}
      </Group>
    </a>
  );
};
