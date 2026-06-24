import { useEffect, useRef, useState } from "react";
import {
  Card,
  Text,
  Group,
  Loader,
  Anchor,
  UnstyledButton,
  UnstyledButtonProps,
  Badge,
  Button,
  Flex,
  Stack,
} from "@mantine/core";
import { getDevelopers, revokeDeveloper } from "@/utils/api/developer.ts";
import { useDisclosure } from "@mantine/hooks";
import { permissionToList, UserPermission } from "@/utils/session.ts";
import { IconArrowBackUp, IconChevronRight, IconRefresh } from "@tabler/icons-react";
import classes from "./AdminDevelopersSection.module.css";
import { openConfirmModal, openRetryModal } from "@/utils/modal.tsx";
import { EditUserModal } from "@/components/Users/EditUserModal.tsx";
import { AnimatedStack } from "@/components/AnimatedGrid.tsx";
import { motion } from "motion/react";
import { UserProps } from "@/types/user";
import { ResponsivePagination } from "@/components/ResponsivePagination.tsx";

interface DeveloperProps {
  id: number;
  user: UserProps;
  name: string;
  url: string;
  reason: string;
  apply_time: string;
  api_key: string;
}

export function UserButton({
  user,
  onClick,
  ...others
}: { user: UserProps; onClick?: () => void } & UnstyledButtonProps) {
  return (
    <UnstyledButton className={classes.user} onClick={onClick} {...others}>
      <Group>
        <div style={{ flex: 1 }}>
          <Flex align="center">
            <Text size="sm" fw={500} mr="xs">
              {user.name}
            </Text>
            {permissionToList(user.permission).indexOf(UserPermission.Developer) !== -1 ? (
              <Badge variant="light">开发者</Badge>
            ) : (
              <Badge color="red" variant="light">
                非开发者
              </Badge>
            )}
          </Flex>

          <Text c="dimmed" size="xs">
            {user.email}
          </Text>
        </div>

        <IconChevronRight size={16} color="gray" />
      </Group>
    </UnstyledButton>
  );
}

interface DeveloperCardProps {
  developer: DeveloperProps;
  userOnClick?: () => void;
}

const DeveloperCard = ({ developer, userOnClick, ...others }: DeveloperCardProps) => {
  const revokeDeveloperHandler = async () => {
    try {
      const res = await revokeDeveloper(developer);
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      window.location.reload();
    } catch (error) {
      openRetryModal("撤销失败", `${error}`, revokeDeveloperHandler);
    }
  };

  return (
    <Card className={classes.card} withBorder radius="md" w="100%" {...others}>
      <Card.Section className={classes.section} p={0}>
        <UserButton user={developer.user} onClick={userOnClick} />
      </Card.Section>
      <Card.Section className={classes.section}>
        <Group justify="space-between">
          <div>
            <Text fz="xs" c="dimmed">
              开发者名称
            </Text>
            <Text fz="sm">{developer.name}</Text>
          </div>
          <div>
            <Text fz="xs" c="dimmed">
              开发者地址
            </Text>
            <Text fz="sm">
              <Anchor
                href={developer.url}
                target="_blank"
                fz="sm"
                style={{
                  wordBreak: "break-all",
                }}
              >
                {developer.url.replace(/(^\w+:|^)\/\//, "")}
              </Anchor>
            </Text>
          </div>
          <div>
            <Text fz="xs" c="dimmed">
              申请时间
            </Text>
            <Text fz="sm">{new Date(developer.apply_time).toLocaleString()}</Text>
          </div>
        </Group>
        <Text fz="xs" c="dimmed" mt="md">
          申请理由
        </Text>
        <Text fz="sm">{developer.reason}</Text>
      </Card.Section>
      <Card.Section p="md">
        <Group justify="flex-end">
          {permissionToList(developer.user.permission).indexOf(UserPermission.Developer) !== -1 ? (
            <>
              <Button variant="outline" size="sm" leftSection={<IconRefresh size={20} />}>
                重置 API 密钥
              </Button>
              <Button
                variant="outline"
                size="sm"
                color="red"
                leftSection={<IconArrowBackUp size={20} />}
                onClick={() =>
                  openConfirmModal(
                    "撤销开发者",
                    "确定要撤销这个开发者吗？",
                    revokeDeveloperHandler,
                    {
                      confirmProps: { color: "red" },
                    },
                  )
                }
              >
                撤销开发者
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              color="red"
              leftSection={<IconArrowBackUp size={20} />}
              onClick={() =>
                openConfirmModal(
                  "撤销开发者申请",
                  "确定要撤销这个开发者申请吗？",
                  revokeDeveloperHandler,
                  {
                    confirmProps: { color: "red" },
                  },
                )
              }
            >
              撤销开发者申请
            </Button>
          )}
        </Group>
      </Card.Section>
    </Card>
  );
};

const AdminDevelopersContent = () => {
  const [displayDevelopers, setDisplayDevelopers] = useState<DeveloperProps[]>([]);
  const [developers, setDevelopers] = useState<DeveloperProps[]>([]);
  const [fetching, setFetching] = useState(true);

  const [opened, { open, close }] = useDisclosure(false);
  const [activeUser, setActiveUser] = useState<UserProps | null>(null);

  const getDevelopersHandler = async () => {
    try {
      const res = await getDevelopers();
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      setDevelopers(
        data.data.sort((a: DeveloperProps, b: DeveloperProps) => {
          return new Date(b.apply_time).getTime() - new Date(a.apply_time).getTime();
        }),
      );
      setFetching(false);
    } catch (error) {
      openRetryModal("开发者列表获取失败", `${error}`, getDevelopersHandler);
    }
  };

  useEffect(() => {
    getDevelopersHandler();
  }, []);

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const totalPages = Math.ceil(developers.length / PAGE_SIZE);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDisplayDevelopers(developers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));
  }, [page, developers]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div ref={topRef} style={{ scrollMarginTop: 16 }}>
      <EditUserModal user={activeUser as UserProps} opened={opened} onClose={() => close()} />
      <Stack align="center">
        {totalPages > 1 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <ResponsivePagination total={totalPages} value={page} onChange={handlePageChange} />
          </motion.div>
        )}
        {fetching && (
          <Group justify="center">
            <Loader />
          </Group>
        )}
        <AnimatedStack
          items={displayDevelopers}
          getKey={(developer) => String(developer.id)}
          renderItem={(developer) => (
            <DeveloperCard
              developer={developer}
              userOnClick={() => {
                setActiveUser(developer.user);
                open();
              }}
            />
          )}
        />
        {totalPages > 1 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <ResponsivePagination total={totalPages} value={page} onChange={handlePageChange} />
          </motion.div>
        )}
      </Stack>
    </div>
  );
};

export const AdminDevelopersSection = () => {
  return <AdminDevelopersContent />;
};
