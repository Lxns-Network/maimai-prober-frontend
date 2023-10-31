import React, { useEffect, useState } from 'react';
import {
  Container,
  createStyles,
  Group,
  Text,
  rem,
  Loader,
  Table,
  TextInput,
  UnstyledButton,
  Center,
  Card,
  ScrollArea,
  Modal,
  Button,
  MultiSelect
} from '@mantine/core';
import { keys } from '@mantine/utils';
import { deleteUser, getUsers, updateUser } from "../../utils/api/user";
import Icon from "@mdi/react";
import {
  mdiAccountSearch,
  mdiChevronDown,
  mdiChevronUp, mdiTrashCan,
  mdiUnfoldMoreHorizontal
} from "@mdi/js";
import { NAVBAR_BREAKPOINT } from '../../App';
import { useDisclosure } from '@mantine/hooks';
import { listToPermission, permissionToList, UserPermission } from "../../utils/session";
import { useForm } from "@mantine/form";
import { validateEmail, validateUserName } from "../../utils/validator";
import useAlert from "../../utils/useAlert";
import AlertModal from "../../components/AlertModal";

const useStyles = createStyles((theme) => ({
  root: {
    padding: rem(16),
    maxWidth: "100%"
  },

  card: {
    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
  },

  th: {
    padding: '0 !important',
  },

  control: {
    width: '100%',
    padding: `${theme.spacing.xs} ${theme.spacing.md}`,

    '&:hover': {
      backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[6] : theme.colors.gray[0],
    },
  },

  icon: {
    width: rem(21),
    height: rem(21),
    borderRadius: rem(21),
  },
}));

export interface UserProps {
  id: number;
  name: string;
  email: string;
  permission: number;
  register_time: string;
  deleted?: boolean;
}

interface ThProps {
  children: React.ReactNode;
  reversed: boolean;
  sorted: boolean;
  onSort(): void;
}

function Th({ children, reversed, sorted, onSort }: ThProps) {
  const { classes } = useStyles();
  const path = sorted ? (reversed ? mdiChevronUp : mdiChevronDown) : mdiUnfoldMoreHorizontal;
  return (
    <th className={classes.th}>
      <UnstyledButton onClick={onSort} className={classes.control}>
        <Group position="apart" noWrap>
          <Text fw={500} fz="sm">{children}</Text>
          <Center className={classes.icon}>
            <Icon path={path} size="0.9rem" />
          </Center>
        </Group>
      </UnstyledButton>
    </th>
  );
}

function filterData(data: UserProps[], search: string) {
  const query = search.toLowerCase().trim();
  return data.filter((item) =>
    keys(item).some((key) => String(item[key]).toLowerCase().includes(query))
  );
}

function sortData(
  data: UserProps[],
  payload: { sortBy: keyof UserProps | null; reversed: boolean; search: string }
) {
  const { sortBy } = payload;

  if (!sortBy) {
    return filterData(data, payload.search);
  }

  return filterData(
    [...data].sort((a, b) => {
      if (typeof a[sortBy] === 'string') {
        if (payload.reversed) {
          return (b[sortBy] as string).localeCompare((a[sortBy] as string));
        }
        return (a[sortBy] as string).localeCompare((b[sortBy] as string));
      } else {
        if (payload.reversed) {
          return (b[sortBy] as number) - (a[sortBy] as number);
        }
        return (a[sortBy] as number) - (b[sortBy] as number);
      }
    }),
    payload.search
  );
}

export const EditUserModal = ({ user, opened, close }: { user: UserProps | null, opened: boolean, close(): void }) => {
  const { isAlertVisible, alertTitle, alertContent, openAlert, closeAlert } = useAlert();
  const [confirmAlert, setConfirmAlert] = useState<() => void>(() => {});
  const form = useForm({
    initialValues: {
      name: '',
      email: '',
    },

    validate: {
      name: (value) => (value == "" || validateUserName(value) ? null : "用户名格式不正确"),
      email: (value) => (value == "" || validateEmail(value) ? null : "邮箱格式不正确"),
    },
  });
  const [permission, setPermission] = useState<string[]>([]);

  useEffect(() => {
    setPermission(
      permissionToList(typeof user?.permission === 'number' ? user?.permission : 0)
        .map((permission) => permission.toString()));
  }, [user]);

  const updateUserHandler = async (values: any) => {
    if (!values.name) values.name = user?.name;
    if (!values.email) values.email = user?.email;

    values.id = user?.id;
    values.permission = listToPermission((permission as string[]).map((permission) => parseInt(permission)));

    try {
      const res = await updateUser(values);
      const data = await res.json();
      if (data.code !== 200) {
        openAlert("保存设置失败", data.message);
        return;
      }

      (user as UserProps).permission = values.permission;
    } catch (err) {
      openAlert("保存设置失败", `${err}`);
    } finally {
      form.reset();
      close();
    }
  }

  const deleteUserHandler = async () => {
    try {
      const res = await deleteUser({ id: user?.id });
      const data = await res.json();
      if (data.code !== 200) {
        openAlert("删除失败", data?.message);
        return;
      }

      (user as UserProps).deleted = true;
    } catch (err) {
      openAlert("删除失败", `${err}`);
    } finally {
      form.reset();
      close();
    }
  }

  return (
    <Modal opened={opened} onClose={close} title="编辑用户" centered>
      <AlertModal title={alertTitle} content={alertContent} opened={isAlertVisible} onClose={closeAlert} onConfirm={confirmAlert} />
      <form onSubmit={form.onSubmit((values) => updateUserHandler(values))}>
        <TextInput label="用户名" placeholder={user?.name} mb="xs" {...form.getInputProps("name")} />
        <TextInput label="邮箱" placeholder={user?.email} mb="xs" {...form.getInputProps("email")} />
        <MultiSelect data={[
          { label: "普通用户", value: UserPermission.User.toString() },
          { label: "开发者", value: UserPermission.Developer.toString() },
          { label: "管理员", value: UserPermission.Administrator.toString() },
        ]} label="权限" mb="xs" defaultValue={permission} onChange={setPermission} />
        <Group position="apart" mt="lg">
          <Group>
            <Button
              variant="outline"
              color="red"
              leftIcon={<Icon path={mdiTrashCan} size={0.75} />}
              onClick={() => {
                setConfirmAlert(() => deleteUserHandler);
                openAlert("删除账号", "你确定要删除该账号吗？");
              }}
            >
              删除账号
            </Button>
          </Group>
          <Group>
            <Button variant="default" onClick={close}>取消</Button>
            <Button color="blue" type="submit">保存</Button>
          </Group>
        </Group>
      </form>
    </Modal>
  )
}

export default function Users() {
  const { classes } = useStyles();
  const [users, setUsers] = useState<UserProps[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const [search, setSearch] = useState('');
  const [sortedData, setSortedData] = useState(users);
  const [sortBy, setSortBy] = useState<keyof UserProps | null>(null);
  const [reverseSortDirection, setReverseSortDirection] = useState(false);

  const [opened, { open, close }] = useDisclosure(false);
  const [activeUser, setActiveUser] = useState<UserProps | null>(null);

  const setSorting = (field: keyof UserProps) => {
    const reversed = field === sortBy ? !reverseSortDirection : false;
    setReverseSortDirection(reversed);
    setSortBy(field);
    setSortedData(sortData(users, { sortBy: field, reversed, search }));
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = event.currentTarget;
    setSearch(value);
    setSortedData(sortData(users, { sortBy, reversed: reverseSortDirection, search: value }));
  };

  const rows = sortedData.map((row: UserProps) => (
    <tr key={row.id} onClick={() => {
      setActiveUser(row);
      open();
    }}>
      <td>{row.id}</td>
      <td>{row.name}</td>
      <td>{row.email}</td>
      <td>{row.permission}</td>
      <td>{(new Date(Date.parse(row.register_time))).toLocaleString()}</td>
    </tr>
  ));

  useEffect(() => {
    document.title = "管理用户 | maimai DX 查分器";

    getUsers()
      .then((res) => res?.json())
      .then((data) => {
        setUsers(data.data);
        setSortedData(data.data);
        setIsLoaded(true);
      });
  }, []);

  return (
    <Container className={classes.root}>
      <EditUserModal user={activeUser as UserProps} opened={opened} close={() => {
        const index = users.findIndex((user) => user.id === activeUser?.id);
        users.splice(index, 1);
        if (activeUser?.deleted != true) {
          users.push(activeUser as UserProps);
        }
        const newUsers = users.sort((a, b) => a.id - b.id);
        setUsers(newUsers);
        setSortedData(newUsers);

        close();
      }} />
      <TextInput
        placeholder="搜索用户"
        mb="md"
        icon={<Icon path={mdiAccountSearch} size={rem(16)} />}
        value={search}
        onChange={handleSearchChange}
      />
      {!isLoaded ? (
        <Group position="center" mt="xl">
          <Loader />
        </Group>
      ) : (
        <Card withBorder radius="md" className={classes.card} mb={0} p={0} component={ScrollArea}
              h="calc(100vh - 140px)" w={window.innerWidth > NAVBAR_BREAKPOINT ? `100%` : "calc(100vw - 32px)"}>
          <Table horizontalSpacing="md" verticalSpacing="xs" highlightOnHover striped>
            <thead>
            <tr>
              <Th sorted={sortBy === 'id'} reversed={reverseSortDirection} onSort={() => setSorting('id')}>
                ID
              </Th>
              <Th sorted={sortBy === 'name'} reversed={reverseSortDirection} onSort={() => setSorting('name')}>
                用户名
              </Th>
              <Th sorted={sortBy === 'email'} reversed={reverseSortDirection} onSort={() => setSorting('email')}>
                邮箱
              </Th>
              <Th sorted={sortBy === 'permission'} reversed={reverseSortDirection} onSort={() => setSorting('permission')}>
                权限
              </Th>
              <Th sorted={sortBy === 'register_time'} reversed={reverseSortDirection} onSort={() => setSorting('register_time')}>
                注册时间
              </Th>
            </tr>
            </thead>
            <tbody>
            {rows.length > 0 ? (
              rows
            ) : (
              <tr>
                <td colSpan={Object.keys(users[0]).length+1}>
                  <Text weight={500} align="center">没有找到任何用户</Text>
                </td>
              </tr>
            )}
            </tbody>
          </Table>
        </Card>
      )}
    </Container>
  );
}
