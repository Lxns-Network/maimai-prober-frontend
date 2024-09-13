import { Divider, Flex, Group, Text } from "@mantine/core";
import classes from './Footer.module.css';

export const Footer = () => {
  return (
    <div className={classes.footer}>
      <Flex className={classes.footerInner} align="center" gap="xs" justify="space-between">
        <Text fw="bold" fz="lg">
          maimai DX 查分器
        </Text>
        <Group>
          <Text size="sm" c="dimmed">&copy; {new Date().getFullYear() + ' '}
            <Text<'a'>
              component="a"
              className={classes.link}
              href="https://lxns.net/"
              target="_blank"
            >
              Lxns Network
            </Text>
          </Text>
          <Divider orientation="vertical" />
          <Text<'a'>
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
  )
}