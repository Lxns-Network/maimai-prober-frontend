import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Box, Container, Divider, ScrollArea } from '@mantine/core';
import { NavbarButton } from "./NavbarButton";
import { checkPermission, UserPermission } from "@/utils/session.ts";
import { logoutUser } from "@/utils/api/user.ts";
import {
  IconCards, IconChartBar, IconCloudUpload, IconCode, IconDoorEnter, IconGavel, IconHelp, IconHome, IconLogout,
  IconMusic, IconSettings2, IconTable, IconTransferIn, IconUserCircle
} from "@tabler/icons-react";
import classes from './Navbar.module.css';

interface NavbarProps {
  style?: React.CSSProperties;
  onClose(): void;
}

export default function Navbar({ style, onClose }: NavbarProps) {
  const [active, setActive] = useState('');
  const isLoggedOut = !localStorage.getItem("token");
  const location = useLocation();

  const navbarData = [
    { label: '首页', icon: <IconHome stroke={1.5} />, to: '/', enabled: true },
    { label: '同步游戏数据', icon: <IconCloudUpload stroke={1.5} />, to: '/sync', enabled: true },
    { label: '账号详情', icon: <IconUserCircle stroke={1.5} />, to: '/user/profile', enabled: !isLoggedOut },
    { label: '成绩管理', icon: <IconChartBar stroke={1.5} />, to: '/user/scores', enabled: !isLoggedOut },
    { label: '账号设置', icon: <IconSettings2 stroke={1.5} />, to: '/user/settings', enabled: !isLoggedOut },
    { label: '曲目查询', icon: <IconMusic stroke={1.5} />, to: '/songs', enabled: true },
    { label: '姓名框查询', icon: <IconCards stroke={1.5} />, to: '/plates', enabled: true },
    { label: '登录账号', icon: <IconDoorEnter stroke={1.5} />, to: '/login', enabled: isLoggedOut, divider: true },
    { label: '新用户注册', icon: <IconTransferIn stroke={1.5} />, to: '/register', enabled: isLoggedOut },
    { label: '曲目别名投票', icon: <IconGavel stroke={1.5} />, to: '/alias/vote', enabled: !isLoggedOut, divider: true },
    { label: '开发者面板', icon: <IconCode stroke={1.5} />, to: '/developer',
      enabled: (!isLoggedOut && checkPermission(UserPermission.Developer)) },
    { label: '申请成为开发者', icon: <IconCode stroke={1.5} />, to: '/developer/apply',
      enabled: !(isLoggedOut || checkPermission(UserPermission.Developer)) },
    { label: '管理面板', icon: <IconTable stroke={1.5} />, to: '/admin/panel',
      enabled: checkPermission(UserPermission.Administrator), divider: true },
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
    <nav className={classes.navbar} style={style}>
      <ScrollArea className={classes.navbarMain} type="scroll">
        <Box pt="md" pb="md">
          {navbarData.map((item) => item.enabled &&
            <Container key={item.label}>
              {item.divider && <Divider className={classes.divider} mt={10} mb={10} />}
              <NavbarButton {...item} active={active} onClose={onClose} />
            </Container>
          )}
        </Box>
      </ScrollArea>
      <div className={classes.navbarFooter}>
        <Container>
          <NavbarButton label="帮助文档" icon={<IconHelp stroke={1.5} />} to="/docs" onClose={onClose} />
          {!isLoggedOut && (
            <NavbarButton label="登出" icon={<IconLogout stroke={1.5} />} to="/" onClose={onClose} onClick={() => {
              logoutUser().then(() => {
                localStorage.removeItem('token');
                window.location.href = "/";
              });
            }} />
          )}
        </Container>
      </div>
    </nav>
  );
}