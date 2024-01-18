import { useEffect, useState } from 'react';
import {
  Container,
  Group,
  TextInput,
  Modal,
  Button,
  MultiSelect,
  Box, Title, Text, keys,
} from '@mantine/core';
import { deleteUser, getUsers, updateUser } from "../../utils/api/user";
import { useDisclosure } from '@mantine/hooks';
import { listToPermission, permissionToList, UserPermission } from "../../utils/session";
import { useForm } from "@mantine/form";
import { validateEmail, validateUserName } from "../../utils/validator";
import useAlert from "../../utils/useAlert";
import AlertModal from "../../components/AlertModal";
import {DataTable, DataTableSortStatus} from "mantine-datatable";
import { NAVBAR_BREAKPOINT } from "../../App.tsx";
import { IconSearch, IconTrash } from "@tabler/icons-react";
import classes from "../Page.module.css";

export interface UserProps {
  id: number;
  name: string;
  email: string;
  permission: number;
  register_time: string;
  deleted?: boolean;
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
    if (!user) return;

    setPermission(permissionToList(user.permission).map((permission) => permission.toString()));
  }, [user]);

  const updateUserHandler = async (values: any) => {
    if (!user) return;

    if (!values.name) values.name = user.name;
    if (!values.email) values.email = user.email;

    values.id = user.id;
    values.permission = listToPermission(permission.map((permission) => parseInt(permission)));

    try {
      const res = await updateUser(values);
      const data = await res.json();
      if (data.code !== 200) {
        openAlert("保存设置失败", data.message);
        return;
      }

      user.permission = values.permission;
    } catch (err) {
      openAlert("保存设置失败", `${err}`);
    } finally {
      form.reset();
      close();
    }
  }

  const deleteUserHandler = async () => {
    if (!user) return;

    try {
      const res = await deleteUser({ id: user.id });
      const data = await res.json();
      if (data.code !== 200) {
        openAlert("删除失败", data.message);
        return;
      }

      user.deleted = true;
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
        <Group justify="space-between" mt="lg">
          <Group>
            <Button
              variant="outline"
              color="red"
              leftSection={<IconTrash size={20} />}
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
  const [users, setUsers] = useState<UserProps[]>([]);
  const [fetching, setFetching] = useState<boolean>(true);

  const [search, setSearch] = useState('');

  const [opened, { open, close }] = useDisclosure(false);
  const [activeUser, setActiveUser] = useState<UserProps | null>(null);

  const PAGE_SIZES = [10, 15, 20];
  const [pageSize, setPageSize] = useState(PAGE_SIZES[1]);
  const [page, setPage] = useState(1);
  const [displayUsers, setDisplayUsers] = useState<any[]>([]);

  const [sortedUser, setSortedUser] = useState(users);
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<UserProps>>({
    columnAccessor: 'id',
    direction: 'asc',
  });

  useEffect(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    setDisplayUsers(sortedUser.slice(start, end));
  }, [page]);

  useEffect(() => {
    setPage(1);
    setDisplayUsers(sortedUser.slice(0, pageSize));
  }, [pageSize]);

  useEffect(() => {
    setPage(1);
    setDisplayUsers(sortedUser.slice(0, pageSize));
  }, [sortedUser]);

  useEffect(() => {
    setSortedUser(sortData(users, {
      sortBy: sortStatus.columnAccessor as keyof UserProps,
      reversed: sortStatus.direction === 'desc',
      search
    }));
  }, [search, sortStatus]);

  const getUserHandler = async () => {
    try {
      const res = await getUsers();
      const data = await res.json();
      if (data.code !== 200) {
        return;
      }
      setUsers(data.data);
      setSortedUser(data.data);
    } catch (error) {
      console.error(error);
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    document.title = "管理用户 | maimai DX 查分器";

    getUserHandler();
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
        setSortedUser(newUsers);

        close();
      }} />
      <Title order={2} size="h2" fw={900} ta="center" mt="xs">
        管理用户
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt="sm" mb="xl">
        查看并管理 maimai DX 查分器的用户
      </Text>
      <TextInput
        placeholder="搜索用户"
        radius="md"
        mb="md"
        leftSection={<IconSearch size={18} />}
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
      />
      <Box w={window.innerWidth > NAVBAR_BREAKPOINT ? `100%` : "calc(100vw - 32px)"}>
        <DataTable
          withTableBorder
          highlightOnHover
          borderRadius="md"
          striped
          verticalSpacing="xs"
          mih={150}
          columns={[
            {
              accessor: 'id',
              title: 'ID',
              width: 70,
              sortable: true,
            },
            {
              accessor: 'name',
              title: '用户名',
              width: 100,
              sortable: true,
            },
            {
              accessor: 'email',
              title: '邮箱',
              width: 200,
              ellipsis: true,
              sortable: true,
            },
            {
              accessor: 'permission',
              title: '权限',
              width: 70,
              sortable: true,
            },
            {
              accessor: 'register_time',
              title: '注册时间',
              width: 150,
              render: ({ register_time }) => new Date(register_time).toLocaleString(),
              sortable: true,
            },
          ]}
          records={displayUsers}
          totalRecords={sortedUser.length}
          sortStatus={sortStatus}
          onSortStatusChange={setSortStatus}
          onCellClick={({ record }) => {
            setActiveUser(record);
            open();
          }}
          recordsPerPage={pageSize}
          paginationText={({ from, to, totalRecords}) => {
            return `${from}-${to} 名用户，共 ${totalRecords} 名`;
          }}
          noRecordsText="0 名用户"
          page={page}
          onPageChange={(p) => setPage(p)}
          recordsPerPageOptions={PAGE_SIZES}
          recordsPerPageLabel="每页显示"
          onRecordsPerPageChange={setPageSize}
          fetching={fetching}
        />
      </Box>
    </Container>
  );
}
