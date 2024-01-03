import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Container,
  createStyles,
  Divider,
  Navbar as MantineNavbar,
  rem,
  ScrollArea,
  SegmentedControl, Space,
  useMantineTheme
} from '@mantine/core';
import { NAVBAR_BREAKPOINT, NAVBAR_WIDTH } from "../App";
import { NavbarButton } from "./NavbarButton";
import { checkPermission, UserPermission } from "../utils/session";
import { QrcodeModal } from "./QrcodeModal";
import { useLocalStorage } from "@mantine/hooks";
import { logoutUser } from "../utils/api/user.tsx";
import {
  IconCards,
  IconChartBar,
  IconCloudUpload, IconCode, IconDoorEnter,
  IconGavel,
  IconHome, IconInfoCircle, IconLogout,
  IconSettings2, IconTable, IconTableOptions, IconTransferIn,
  IconUserCircle
} from "@tabler/icons-react";

const useStyles = createStyles((theme) => ({
  navbar: {
    position: 'fixed',
    zIndex: 100,
    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
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
    paddingBottom: theme.spacing.md,
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
  const [qrcodeOpened, setQrcodeOpened] = useState(false);
  const [active, setActive] = useState('');
  const [game, setGame] = useLocalStorage({ key: 'game', defaultValue: 'maimai' });
  const location = useLocation();
  const theme = useMantineTheme();

  const isLoggedOut = !Boolean(localStorage.getItem("token"));

  const navbarData = [
    { label: '首页', icon: <IconHome size={24} />, to: '/', enabled: true },
    { label: '登录', icon: <IconDoorEnter size={24} />, to: '/login', enabled: isLoggedOut },
    { label: '注册', icon: <IconTransferIn size={24} />, to: '/register', enabled: isLoggedOut },
    { label: '同步游戏数据', icon: <IconCloudUpload size={24} />, to: '/user/sync', enabled: !isLoggedOut },
    { label: '账号详情', icon: <IconUserCircle size={24} />, to: '/user/profile', enabled: !isLoggedOut },
    { label: '成绩管理', icon: <IconChartBar size={24} />, to: '/user/scores', enabled: !isLoggedOut },
    { label: '姓名框查询', icon: <IconCards size={24} />, to: '/user/plates', enabled: !isLoggedOut },
    { label: '账号设置', icon: <IconSettings2 size={24} />, to: '/user/settings', enabled: !isLoggedOut },
    { label: '曲目别名投票', icon: <IconGavel size={24} />, to: '/alias/vote', enabled: !isLoggedOut, divider: true },
    { label: '开发者面板', icon: <IconCode size={24} />, to: '/developer',
      enabled: (!isLoggedOut && checkPermission(UserPermission.Developer)) },
    { label: '申请成为开发者', icon: <IconCode size={24} />, to: '/developer/apply',
      enabled: !(isLoggedOut || checkPermission(UserPermission.Developer)) },
    { label: '管理用户', icon: <IconTable size={24} />, to: '/admin/users',
      enabled: checkPermission(UserPermission.Administrator), divider: true },
    { label: '管理开发者', icon: <IconTableOptions size={24} />, to: '/admin/developers',
      enabled: checkPermission(UserPermission.Administrator) },
  ];

  useEffect(() => {
    const currentPath = location.pathname;
    const activeNavItem = navbarData.find(item => item.to.startsWith(currentPath));

    if (activeNavItem) {
      setActive(activeNavItem.label);
    } else {
      setActive('');
    }
  }, [location.pathname, navbarData]);

  return (
    <MantineNavbar
      className={classes.navbar}
      width={{ sm: NAVBAR_WIDTH }}
      hiddenBreakpoint={NAVBAR_BREAKPOINT}
      style={style}
    >
      <QrcodeModal opened={qrcodeOpened} onClose={() => setQrcodeOpened(false)} />
      <MantineNavbar.Section grow component={ScrollArea}>
        {!isLoggedOut && (
          <Container>
            <Space h="md" />
            <SegmentedControl fullWidth mt={0} value={game} onChange={setGame} data={[
              { label: '舞萌 DX', value: 'maimai' },
              { label: '中二节奏', value: 'chunithm' },
            ]} />
          </Container>
        )}
        <Space h="md" />
        {navbarData.map((item) => item.enabled &&
          <Container key={item.label}>
            {item.divider && <Divider color={
              theme.colorScheme === 'dark' ? theme.colors.dark[4] : theme.colors.gray[2]
            } mt={10} mb={10} />}
            <NavbarButton {...item} active={active} onClose={onClose} />
          </Container>
        )}
        <Space h="md" />
      </MantineNavbar.Section>

      <MantineNavbar.Section className={classes.navbarFooter}>
        <Container>
          <NavbarButton label="关于 maimai DX 查分器" icon={<IconInfoCircle size={24} />} to="/about" onClose={onClose} />
          {!isLoggedOut && (
            <>
              {/*
              <NavbarButton label="应用登录二维码" icon={mdiQrcode} onClose={() => null} onClick={() => {
                setQrcodeOpened(true);
              }} />
              */}
              <NavbarButton label="登出" icon={<IconLogout size={24} />} to="/" onClose={onClose} onClick={() => {
                logoutUser().then(() => {
                  localStorage.removeItem('token');
                }).then(() => {
                  window.location.href = "/";
                });
              }} />
            </>
          )}
        </Container>
      </MantineNavbar.Section>
    </MantineNavbar>
  );
}