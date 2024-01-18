import { useNavigate } from "react-router-dom";
import { Group, Text } from "@mantine/core";
import React from "react";
import classes from './Navbar.module.css';

interface NavbarButtonProps {
  label: string;
  icon: React.ReactNode;
  to?: string;
  active?: string;
  onClose(): void;
  onClick?(): void;
}

export const NavbarButton = ({ label, icon, to, active, onClose, onClick }: NavbarButtonProps) => {
  const navigate = useNavigate();

  return (
    <a href={to} key={label}
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
        <div className={classes.navbarLinkIcon}>{icon}</div>
        <Text size="sm">{label}</Text>
      </Group>
    </a>
  )
}