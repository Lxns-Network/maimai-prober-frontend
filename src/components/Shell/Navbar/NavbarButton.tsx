import { Badge, Group, Indicator, Text } from "@mantine/core";
import React from "react";
import classes from "./Navbar.module.css";
import { navigate } from "vike/client/router";

interface NavbarButtonProps {
  label: string;
  icon: React.ReactNode;
  is_new?: boolean;
  count?: number;
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
  to,
  active,
  onClose,
  onClick,
}: NavbarButtonProps) => {
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
        <Indicator
          color="red"
          size={16}
          disabled={!count}
          label={(count ?? 0) > 99 ? "99+" : count}
        >
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
