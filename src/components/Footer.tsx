import { Divider, Flex, Group, Image, Text } from "@mantine/core";
import classes from './Footer.module.css';

export const Footer = () => {
  return (
    <div className={classes.footer}>
      <Flex className={classes.footerInner} align="center" p="md" gap="xs" justify="space-between">
        <Group style={{ flex: 1 }}>
          <Image src="/favicon.webp" width={32} height={32} />
          <Text fw={700} fz={18}>
            maimai DX 查分器
          </Text>
        </Group>
        <Group>
          <Text size="sm" color="dimmed">&copy; {new Date().getFullYear() + ' '}
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
            c="dimmed"
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