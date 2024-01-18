import { useEffect, useState } from 'react';
import {
  Container,
  Card,
  Title,
  Text,
  Group,
  Loader,
  Anchor,
  UnstyledButton,
  UnstyledButtonProps,
  Badge,
  Button,
  Flex,
} from '@mantine/core';
import { getDevelopers, revokeDeveloper } from "../../utils/api/developer";
import { EditUserModal, UserProps } from "./Users";
import { useDisclosure } from "@mantine/hooks";
import { permissionToList, UserPermission } from "../../utils/session";
import useAlert from "../../utils/useAlert";
import AlertModal from "../../components/AlertModal";
import { IconArrowBackUp, IconChevronRight, IconRefresh } from "@tabler/icons-react";
import classes from "./Developers.module.css";

interface DeveloperProps {
  id: number;
  user: UserProps;
  name: string;
  url: string;
  reason: string;
  apply_time: string;
  api_key: string;
}

export function UserButton({ user, onClick, ...others }: { user: UserProps, onClick?: () => void } & UnstyledButtonProps) {
  return (
    <UnstyledButton className={classes.user} onClick={onClick} {...others}>
      <Group>
        <div style={{ flex: 1 }}>
          <Flex align="center">
            <Text size="sm" fw={500} mr="xs">
              {user.name}
            </Text>
            {permissionToList(user.permission).indexOf(UserPermission.Developer) !== -1 ? (
              <Badge color="blue" variant="light">开发者</Badge>
            ) : (
              <Badge color="red" variant="light">非开发者</Badge>
            )}
          </Flex>

          <Text c="dimmed" size="xs">{user.email}</Text>
        </div>

        <IconChevronRight size={16} />
      </Group>
    </UnstyledButton>
  );
}

interface DeveloperCardProps {
  developer: DeveloperProps;
  userOnClick?: () => void;
  openAlert: (title: string, content: string) => void;
  setConfirmAlert?: (confirm: () => void) => void;
}

const DeveloperCard = ({ developer, userOnClick, openAlert, setConfirmAlert, ...others }: DeveloperCardProps) => {
  const revokeDeveloperHandler = async () => {
    try {
      const res = await revokeDeveloper(developer);
      const data = await res.json();
      if (data.code !== 200) {
        openAlert("撤销开发者失败", data.message);
        return;
      }
      window.location.reload();
    } catch (error) {
      openAlert("撤销开发者失败", `${error}`);
    } finally {
      setConfirmAlert?.(() => {});
    }
  }

  return (
    <Card className={classes.card} withBorder radius="md" mb="md" {...others}>
      <Card.Section className={classes.section} p={0}>
        <UserButton user={developer.user} onClick={userOnClick} />
      </Card.Section>
      <Card.Section className={classes.section}>
        <Group justify="space-between">
          <div>
            <Text fz="xs" c="dimmed">项目名称</Text>
            <Text fz="sm">{developer.name}</Text>
          </div>
          <div>
            <Text fz="xs" c="dimmed">项目地址</Text>
            <Text fz="sm">
              <Anchor href={developer.url} target="_blank" style={{
                wordBreak: "break-all",
              }}>{developer.url}</Anchor>
            </Text>
          </div>
          <div>
            <Text fz="xs" c="dimmed">申请时间</Text>
            <Text fz="sm">
              {new Date(developer.apply_time).toLocaleString()}
            </Text>
          </div>
        </Group>
        <Text fz="xs" c="dimmed" mt="md">申请理由</Text>
        <Text fz="sm">{developer.reason}</Text>
      </Card.Section>
      <Card.Section p="md">
        <Group justify="flex-end">
          {permissionToList(developer.user.permission).indexOf(UserPermission.Developer) !== -1 && (
            <Button variant="outline" size="sm" leftSection={<IconRefresh size={20} />}>
              重置 API 密钥
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            color="red"
            leftSection={<IconArrowBackUp size={20} />}
            onClick={() => {
              setConfirmAlert?.(() => revokeDeveloperHandler);
              openAlert("撤销开发者", "确定要撤销这个开发者吗？");
            }}
          >
            撤销开发者
          </Button>
        </Group>
      </Card.Section>
    </Card>
  )
}

export default function Developers() {
  const { isAlertVisible, alertTitle, alertContent, openAlert, closeAlert } = useAlert();
  const [confirmAlert, setConfirmAlert] = useState<() => void>(() => {});
  const [developers, setDevelopers] = useState<DeveloperProps[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const [opened, { open, close }] = useDisclosure(false);
  const [activeUser, setActiveUser] = useState<UserProps | null>(null);

  useEffect(() => {
    document.title = "管理开发者 | maimai DX 查分器";

    getDevelopers()
      .then((res) => res?.json())
      .then((data) => {
        setDevelopers(data.data.sort((a: DeveloperProps, b: DeveloperProps) => {
          return new Date(b.apply_time).getTime() - new Date(a.apply_time).getTime();
        }));
        setIsLoaded(true);
      });
  }, []);

  return (
    <Container className={classes.root}>
      <AlertModal
        title={alertTitle}
        content={alertContent}
        opened={isAlertVisible}
        onClose={closeAlert}
        onConfirm={confirmAlert}
      />
      <EditUserModal user={activeUser as UserProps} opened={opened} close={() => close()} />
      <Title order={2} size="h2" fw={900} ta="center" mt="xs">
        管理开发者
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt="sm" mb="xl">
        查看并管理 maimai DX 查分器的开发者
      </Text>
      {!isLoaded ? (
        <Group justify="center" mt="xl">
          <Loader />
        </Group>
      ) : (
        developers.map((developer) => (
          <DeveloperCard
            key={developer.id}
            developer={developer}
            userOnClick={
              () => {
                setActiveUser(developer.user);
                open();
              }
            }
            openAlert={openAlert}
            setConfirmAlert={setConfirmAlert}
          />
        ))
      )}
    </Container>
  );
}
