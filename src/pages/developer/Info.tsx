import { useEffect, useState } from 'react';
import {
  Container,
  createStyles,
  Group,
  Text,
  Title,
  rem, Loader, Card, Switch, Input, ActionIcon, Tooltip, CopyButton, Anchor, Divider, useMantineTheme,
} from '@mantine/core';
import { getDeveloperApply } from "../../utils/api/api";
import Icon from "@mdi/react";
import { mdiCheck, mdiContentCopy, mdiEye, mdiEyeOff } from "@mdi/js";
import { useDisclosure } from "@mantine/hooks";
import { useNavigate } from "react-router-dom";

const useStyles = createStyles((theme) => ({
  root: {
    padding: rem(16),
    maxWidth: rem(600),
  },

  card: {
    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
  },
}));

export default function DeveloperInfo() {
  const { classes } = useStyles();
  const [developerData, setDeveloperData] = useState<any>(null);
  const [visible, visibleHandler] = useDisclosure(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const navigate = useNavigate();
  const theme = useMantineTheme();

  useEffect(() => {
    document.title = "开发者面板 | maimai DX 查分器";

    getDeveloperApply()
      .then(res => res?.json())
      .then(data => {
        if (data.data != null) {
          if (data.data.api_key == null) {
            navigate("/developer/apply");
          }
          setDeveloperData(data.data);
        } else {
          navigate("/developer/apply");
        }
        setIsLoaded(true);
      });
  }, []);

  return (
    <Container className={classes.root} size={400}>
      <Title order={2} size="h2" weight={900} align="center" mt="xs">
        开发者面板
      </Title>
      <Text color="dimmed" size="sm" align="center" mt="sm" mb="xl">
        查看你的 maimai DX 查分器开发者信息
      </Text>
      {!isLoaded ? (
        <Group position="center" mt="xl">
          <Loader />
        </Group>
      ) : (
        <>
          <Card withBorder radius="md" className={classes.card} mb="md">
            <Text fz="lg" fw={700}>
              我的申请信息
            </Text>
            <Text fz="xs" c="dimmed" mt={3}>
              查看你的开发者申请信息
            </Text>
            <Divider mt="md" mb="md" color={theme.colorScheme === 'dark' ? theme.colors.dark[5] : theme.colors.gray[2]} />
            <Group mt="md">
              <Text fz="xs" c="dimmed">项目名称</Text>
              <Text fz="sm">{developerData.name}</Text>
            </Group>
            <Group mt="md">
              <Text fz="xs" c="dimmed">项目地址</Text>
              <Text fz="sm">
                <Anchor href={developerData.url} target="_blank">{developerData.url}</Anchor>
              </Text>
            </Group>
            <Group mt="md">
              <Text fz="xs" c="dimmed">申请时间</Text>
              <Text fz="sm">
                {new Date(developerData.apply_time).toLocaleString()}
              </Text>
            </Group>
            <Group mt="md">
              <Text fz="xs" c="dimmed">申请理由</Text>
              <Text fz="sm">
                {developerData.reason}
              </Text>
            </Group>
          </Card>
          <Card withBorder radius="md" className={classes.card} mb="md">
            <Group position="apart" noWrap spacing="xl" align="center" mb="md">
              <div>
                <Text fz="lg" fw={700}>
                  API 密钥
                </Text>
                <Text fz="xs" c="dimmed" mt={3}>
                  用于访问 maimai DX 查分器 API
                </Text>
              </div>
              <Switch
                size="lg"
                value={visible ? "visible" : "hidden"}
                onClick={visibleHandler.toggle}
                onLabel={<Icon path={mdiEye} size={0.8} />}
                offLabel={<Icon path={mdiEyeOff} size={0.8} />}
              />
            </Group>
            <Input
              variant="filled"
              value={visible ? developerData.api_key : developerData.api_key.replace(/./g, '•')}
              rightSection={
                <CopyButton value={developerData.api_key} timeout={2000}>
                  {({ copied, copy }) => (
                    <Tooltip label={copied ? '已复制' : '复制'} withArrow position="right">
                      <ActionIcon color={copied ? 'teal' : 'gray'} onClick={copy}>
                        <Icon path={copied ? mdiCheck : mdiContentCopy} size={0.75} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </CopyButton>
              }
              readOnly
            />
          </Card>
        </>
      )}
    </Container>
  );
}
