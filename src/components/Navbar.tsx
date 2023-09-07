import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Navbar as MantineNavbar,
  ScrollArea,
  createStyles,
  getStylesRef,
  rem,
  em,
} from '@mantine/core';
import Icon from "@mdi/react";
import {
  mdiAccountCheckOutline,
  mdiAccountOutline,
  mdiAccountPlusOutline,
  mdiCloudSyncOutline,
  mdiCogOutline,
  mdiHomeOutline,
  mdiInformationOutline,
  mdiLogoutVariant,
  mdiTable
} from '@mdi/js';
import { NAVBAR_WIDTH, NAVBAR_BREAKPOINT } from "../App";

const useStyles = createStyles((theme) => ({
  navbar: {
    position: 'fixed',
    zIndex: 100,
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

  const isLoggedOut = !Boolean(localStorage.getItem("token"));

  const navbarData = [
    { label: '首页', icon: mdiHomeOutline, to: '/', enabled: true },
    { label: '登录', icon: mdiAccountCheckOutline, to: '/login', enabled: isLoggedOut },
    { label: '注册', icon: mdiAccountPlusOutline, to: '/register', enabled: isLoggedOut },
    { label: '账号详情', icon: mdiAccountOutline, to: '/user/profile', enabled: !isLoggedOut },
    { label: '同步游戏数据', icon: mdiCloudSyncOutline, to: '/user/sync', enabled: !isLoggedOut },
    { label: '成绩管理', icon: mdiTable, to: '/user/scores', enabled: !isLoggedOut },
    { label: '账号设置', icon: mdiCogOutline, to: '/user/settings', enabled: !isLoggedOut },
  ];

  useEffect(() => {
    const currentPath = location.pathname;
    const activeNavItem = navbarData.find(item => item.to.startsWith(currentPath));
    if (activeNavItem) {
      setActive(activeNavItem.label);
    }
  }, [location.pathname, navbarData]);

  return (
    <MantineNavbar
      className={classes.navbar}
      width={{ sm: NAVBAR_WIDTH }}
      p="md"
      hiddenBreakpoint="sm"
      style={style}
    >
      <MantineNavbar.Section grow component={ScrollArea} mx="-xs" px="xs">
        {navbarData.map((item) => !item.enabled ? null :
          <a href={item.to} key={item.label}
             className={cx(classes.link, { [classes.linkActive]: item.label === active })}
             onClick={(event) => {
               event.preventDefault();
               setActive(item.label);
               navigate(item.to);
               onClose();
             }}
          >
            <Icon className={classes.linkIcon} path={item.icon} size={1} />
            <span>{item.label}</span>
          </a>
        )}
      </MantineNavbar.Section>

      <MantineNavbar.Section className={classes.navbarFooter}>
        <a href="/public/About" className={classes.link} onClick={(event) => event.preventDefault()}>
          <Icon className={classes.linkIcon} path={mdiInformationOutline} size={1} />
          <span>关于 maimai DX 查分器</span>
        </a>

        <a href="/" className={classes.link} onClick={(event) => {
          event.preventDefault()
          localStorage.removeItem("token")
          navigate("/")
        }}>
          <Icon className={classes.linkIcon} path={mdiLogoutVariant} size={1} />
          <span>登出</span>
        </a>
      </MantineNavbar.Section>
    </MantineNavbar>
  );
}