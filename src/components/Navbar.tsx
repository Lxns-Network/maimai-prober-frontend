import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Navbar as MantineNavbar,
  ScrollArea,
  createStyles,
  rem,
  em,
  Divider,
  useMantineTheme,
} from '@mantine/core';
import {
  mdiAccountCheckOutline,
  mdiAccountOutline,
  mdiAccountPlusOutline,
  mdiChartBoxOutline,
  mdiCloudUploadOutline,
  mdiCogOutline,
  mdiHomeOutline,
  mdiInformationOutline,
  mdiLogoutVariant,
  mdiWrenchCheckOutline,
} from '@mdi/js';
import { NAVBAR_WIDTH, NAVBAR_BREAKPOINT } from "../App";
import { NavbarButton } from "./NavbarButton";

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
}));

interface NavbarProps {
  style?: React.CSSProperties;
  onClose(): void;
}

export default function Navbar({ style, onClose }: NavbarProps) {
  const { classes } = useStyles();
  const [active, setActive] = useState('');
  const location = useLocation();
  const theme = useMantineTheme();

  const isLoggedOut = !Boolean(localStorage.getItem("token"));

  const navbarData = [
    { label: '首页', icon: mdiHomeOutline, to: '/', enabled: true },
    { label: '登录', icon: mdiAccountCheckOutline, to: '/login', enabled: isLoggedOut },
    { label: '注册', icon: mdiAccountPlusOutline, to: '/register', enabled: isLoggedOut },
    { label: '同步游戏数据', icon: mdiCloudUploadOutline, to: '/user/sync', enabled: !isLoggedOut },
    { label: '账号详情', icon: mdiAccountOutline, to: '/user/profile', enabled: !isLoggedOut },
    { label: '成绩管理', icon: mdiChartBoxOutline, to: '/user/scores', enabled: !isLoggedOut },
    { label: '账号设置', icon: mdiCogOutline, to: '/user/settings', enabled: !isLoggedOut },
    { label: '申请成为开发者', icon: mdiWrenchCheckOutline, to: '/developer/apply', enabled: !isLoggedOut, divider: true },
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
        {navbarData.map((item) => item.enabled &&
          <>
            {item.divider && <Divider color={
              theme.colorScheme === 'dark' ? theme.colors.dark[4] : theme.colors.gray[2]
            } mt={10} mb={10} />}
            <NavbarButton {...item} active={active} onClose={onClose} />
          </>
        )}
      </MantineNavbar.Section>

      <MantineNavbar.Section className={classes.navbarFooter}>
        <NavbarButton label="关于 maimai DX 查分器" icon={mdiInformationOutline} to="/about" onClose={onClose} />
        <NavbarButton label="登出" icon={mdiLogoutVariant} to="/" onClose={onClose} onClick={() => {
          localStorage.removeItem("token");
        }} />
      </MantineNavbar.Section>
    </MantineNavbar>
  );
}