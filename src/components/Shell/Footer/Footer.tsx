import { Divider, Flex, Group, Text } from "@mantine/core";
import type { CSSProperties } from "react";
import classes from "./Footer.module.css";

interface FooterProps {
  /** 页脚内容的最大宽度，需与所在页面的容器宽度一致；缺省时与 Mantine md 容器等宽。 */
  maxWidth?: number;
}

export const Footer = ({ maxWidth }: FooterProps) => {
  return (
    <div className={classes.footer}>
      <Flex
        className={classes.footerInner}
        style={maxWidth ? ({ "--footer-max-width": `${maxWidth}px` } as CSSProperties) : undefined}
        align="center"
        gap="xs"
        justify="space-between"
      >
        <Text fw="bold" fz="lg">
          maimai DX 查分器
        </Text>
        <Group>
          <Text size="sm" c="dimmed">
            &copy; {new Date().getFullYear() + " "}
            <Text<"a">
              component="a"
              className={classes.link}
              href="https://lxns.net/"
              target="_blank"
            >
              Lxns Network
            </Text>
          </Text>
          <Divider orientation="vertical" />
          <Text<"a">
            component="a"
            className={classes.link}
            size="sm"
            href="https://beian.miit.gov.cn/"
            target="_blank"
          >
            粤ICP备18035696号
          </Text>
        </Group>
      </Flex>
    </div>
  );
};
