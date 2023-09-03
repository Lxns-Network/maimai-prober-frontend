import React, {useEffect, useState} from "react";
import {useLocation, useNavigate } from "react-router-dom";
import {
  Navbar as MantineNavbar,
  ScrollArea,
  createStyles,
  getStylesRef,
  rem,
  em,
} from '@mantine/core';
import {
  IconHome,
  IconSettings,
  IconInfoCircle,
  IconLogout,
  IconChartBar,
} from '@tabler/icons-react';
import { NAVBAR_WIDTH, NAVBAR_BREAKPOINT } from "../../App";

const useStyles = createStyles((theme) => ({
  navbar: {
    position: 'fixed',
    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[8] : theme.white,

    [`@media (max-width: ${em(NAVBAR_BREAKPOINT)})`]: {
      display: 'block',
      width: '100%',
      right: 0,
    },
  },

  navbarHeader: {
    paddingBottom: theme.spacing.md,
    marginBottom: `calc(${theme.spacing.md} * 1.5)`,
    borderBottom: `${rem(1)} solid ${
      theme.colorScheme === 'dark' ? theme.colors.dark[4] : theme.colors.gray[2]
    }`,
  },

  navbarFooter: {
    paddingTop: theme.spacing.md,
    marginTop: theme.spacing.md,
    borderTop: `${rem(1)} solid ${
      theme.colorScheme === 'dark' ? theme.colors.dark[4] : theme.colors.gray[2]
    }`,
  },

  link: {
    ...theme.fn.focusStyles(),
    display: 'flex',
    alignItems: 'center',
    textDecoration: 'none',
    fontSize: theme.fontSizes.sm,
    color: theme.colorScheme === 'dark' ? theme.colors.dark[1] : theme.colors.gray[7],
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    borderRadius: theme.radius.sm,
    fontWeight: 500,

    '&:hover': {
      backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[6] : theme.colors.gray[0],
      color: theme.colorScheme === 'dark' ? theme.white : theme.black,

      [`& .${getStylesRef('icon')}`]: {
        color: theme.colorScheme === 'dark' ? theme.white : theme.black,
      },
    },
  },

  linkIcon: {
    ref: getStylesRef('icon'),
    color: theme.colorScheme === 'dark' ? theme.colors.dark[2] : theme.colors.gray[6],
    marginRight: theme.spacing.sm,
  },

  linkActive: {
    '&, &:hover': {
      backgroundColor: theme.fn.variant({ variant: 'light', color: theme.primaryColor }).background,
      color: theme.fn.variant({ variant: 'light', color: theme.primaryColor }).color,
      [`& .${getStylesRef('icon')}`]: {
        color: theme.fn.variant({ variant: 'light', color: theme.primaryColor }).color,
      },
    },
  },
}));

interface NavbarProps {
  style?: React.CSSProperties;
  onClose(): void;
}

export default function Navbar({ style, onClose }: NavbarProps) {
  const { classes, cx } = useStyles();
  const [active, setActive] = useState('');
  const navigate = useNavigate();
  const location = useLocation();

  const navbarData = [
    { label: '首页', icon: IconHome, to: '/' },
    { label: '成绩管理', icon: IconChartBar, to: '/scores' },
    { label: '设置', icon: IconSettings, to: '/settings' },
  ];

  useEffect(() => {
    const currentPath = location.pathname;
    const activeNavItem = navbarData.find(item => item.to.startsWith(currentPath));
    if (activeNavItem) {
      setActive(activeNavItem.label);
    }
  }, [location.pathname, navbarData]);

  const links = navbarData.map((item) => (
    <a
      className={cx(classes.link, { [classes.linkActive]: item.label === active })}
      href={item.to}
      key={item.label}
      onClick={(event) => {
        event.preventDefault();
        setActive(item.label);
        navigate(item.to);
        onClose();
      }}
    >
      <item.icon className={classes.linkIcon} stroke={1.5} />
      <span>{item.label}</span>
    </a>
  ));

  return (
    <MantineNavbar
      className={classes.navbar}
      width={{ sm: NAVBAR_WIDTH }}
      p="md"
      hiddenBreakpoint="sm"
      style={style}
    >
      <MantineNavbar.Section grow component={ScrollArea} mx="-xs" px="xs">
        {links}
      </MantineNavbar.Section>

      <MantineNavbar.Section className={classes.navbarFooter}>
        <a href="src/components#" className={classes.link} onClick={(event) => event.preventDefault()}>
          <IconInfoCircle className={classes.linkIcon} stroke={1.5} />
          <span>关于 maimai DX 查分器</span>
        </a>

        <a href="src/components#" className={classes.link} onClick={(event) => event.preventDefault()}>
          <IconLogout className={classes.linkIcon} stroke={1.5} />
          <span>登出</span>
        </a>
      </MantineNavbar.Section>
    </MantineNavbar>
  );
}