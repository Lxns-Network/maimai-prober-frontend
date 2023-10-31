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
import {
  mdiAccountCheckOutline,
  mdiAccountMultipleOutline,
  mdiAccountOutline,
  mdiAccountPlusOutline,
  mdiAccountWrenchOutline,
  mdiCardsOutline,
  mdiChartBoxOutline,
  mdiCloudUploadOutline,
  mdiCogOutline,
  mdiHomeOutline,
  mdiInformationOutline,
  mdiLogoutVariant,
  mdiQrcode,
  mdiWrenchCheckOutline,
  mdiXml,
} from '@mdi/js';
import { NAVBAR_WIDTH } from "../App";
import { NavbarButton } from "./NavbarButton";
import { checkPermission, logout, UserPermission } from "../utils/session";
import { QrcodeModal } from "./QrcodeModal";
import {useLocalStorage} from "@mantine/hooks";

const useStyles = createStyles((theme) => ({
  navbar: {
    position: 'fixed',
    zIndex: 100,
    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[8] : theme.white,
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
    { label: '首页', icon: mdiHomeOutline, to: '/', enabled: true },
    { label: '登录', icon: mdiAccountCheckOutline, to: '/login', enabled: isLoggedOut },
    { label: '注册', icon: mdiAccountPlusOutline, to: '/register', enabled: isLoggedOut },
    { label: '同步游戏数据', icon: mdiCloudUploadOutline, to: '/user/sync', enabled: !isLoggedOut },
    { label: '账号详情', icon: mdiAccountOutline, to: '/user/profile', enabled: !isLoggedOut },
    { label: '成绩管理', icon: mdiChartBoxOutline, to: '/user/scores', enabled: !isLoggedOut },
    { label: '姓名框查询', icon: mdiCardsOutline, to: '/user/plates', enabled: !isLoggedOut },
    { label: '账号设置', icon: mdiCogOutline, to: '/user/settings', enabled: !isLoggedOut },
    { label: '开发者面板', icon: mdiXml, to: '/developer',
      enabled: (!isLoggedOut && checkPermission(UserPermission.Developer)), divider: true },
    { label: '申请成为开发者', icon: mdiWrenchCheckOutline, to: '/developer/apply',
      enabled: !(isLoggedOut || checkPermission(UserPermission.Developer)), divider: true },
    { label: '管理用户', icon: mdiAccountMultipleOutline, to: '/admin/users',
      enabled: checkPermission(UserPermission.Administrator), divider: true },
    { label: '管理开发者', icon: mdiAccountWrenchOutline, to: '/admin/developers',
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
      hiddenBreakpoint="sm"
      style={style}
    >
      <MantineNavbar.Section grow component={ScrollArea}>
        <Space h="md" />
        {!isLoggedOut && (
          <Container>
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
          <NavbarButton label="关于 maimai DX 查分器" icon={mdiInformationOutline} to="/about" onClose={onClose} />
          {!isLoggedOut && (
            <>
              <QrcodeModal opened={qrcodeOpened} onClose={() => setQrcodeOpened(false)} />
              <NavbarButton label="应用登录二维码" icon={mdiQrcode} onClose={() => null} onClick={() => {
                setQrcodeOpened(true);
              }} />
              <NavbarButton label="登出" icon={mdiLogoutVariant} to="/" onClose={onClose} onClick={() => {
                logout();
                window.location.href = "/";
              }} />
            </>
          )}
        </Container>
      </MantineNavbar.Section>
    </MantineNavbar>
  );
}