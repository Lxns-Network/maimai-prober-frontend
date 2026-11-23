import React, { useMemo } from "react";
import { usePageContext } from "vike-react/usePageContext";
import { Box, Container, Divider, ScrollArea } from "@mantine/core";
import { NavbarButton } from "./NavbarButton";
import { NavbarUserMenu } from "./NavbarUserMenu";
import classes from "./Navbar.module.css";
import { useFriendRequestCounts } from "@/hooks/queries/useFriends.ts";
import { getNavItems, helpNavItem } from "./navItems.tsx";

interface NavbarProps {
  style?: React.CSSProperties;
  onClose(): void;
}

export default function Navbar({ style, onClose }: NavbarProps) {
  const { urlPathname } = usePageContext();
  const isLoggedOut = typeof window !== "undefined" ? !localStorage.getItem("token") : true;
  const { incoming: pendingFriendRequests } = useFriendRequestCounts();

  const navbarData = useMemo(() => getNavItems(isLoggedOut), [isLoggedOut]);

  // 只在已启用的入口里匹配，并取最长前缀：避免「开发者面板」(/developer) 抢走 /developer/apply。
  const active =
    navbarData
      .filter(
        (item) =>
          item.enabled && (urlPathname === item.to || urlPathname.startsWith(`${item.to}/`)),
      )
      .sort((a, b) => b.to.length - a.to.length)[0]?.label ?? "";

  return (
    <nav className={classes.navbar} style={style}>
      <ScrollArea className={classes.navbarMain} type="scroll">
        <Box pt="md" pb="md">
          {navbarData.map(
            (item) =>
              item.enabled && (
                <Container key={item.label}>
                  {item.divider && <Divider className={classes.divider} mt={10} mb={10} />}
                  <NavbarButton
                    {...item}
                    count={item.label === "好友" ? pendingFriendRequests : undefined}
                    active={active}
                    onClose={onClose}
                  />
                </Container>
              ),
          )}
        </Box>
      </ScrollArea>
      <div className={classes.navbarFooter}>
        <Container>
          <NavbarButton {...helpNavItem} onClose={onClose} />
          {!isLoggedOut && <NavbarUserMenu onClose={onClose} />}
        </Container>
      </div>
    </nav>
  );
}
