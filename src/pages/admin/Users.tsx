import { useEffect, useState } from 'react';
import {
  Group,
  TextInput,
  Button,
  Text, keys, Flex, Card, Badge
} from '@mantine/core';
import { deleteUsers, getUsers } from "../../utils/api/user";
import { useDisclosure, useViewportSize } from '@mantine/hooks';
import { DataTable, DataTableSortStatus } from "mantine-datatable";
import { NAVBAR_BREAKPOINT } from "../../App.tsx";
import { IconDatabaseOff, IconSearch, IconSend, IconTrash } from "@tabler/icons-react";
import classes from "../Page.module.css";
import { openAlertModal, openConfirmModal, openRetryModal } from "../../utils/modal.tsx";
import { EditUserModal } from "../../components/Users/EditUserModal.tsx";
import { SendBatchEmailModal } from "../../components/Users/SendBatchEmailModal.tsx";
import { permissionToList, UserPermission } from "../../utils/session.tsx";
import { Page } from "@/components/Page/Page.tsx";

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

const AdminUsersContent = () => {
  const [users, setUsers] = useState<UserProps[]>([]);
  const [fetching, setFetching] = useState<boolean>(true);

  const [search, setSearch] = useState('');

  const [editUserModalOpened, editUserModal] = useDisclosure(false);
  const [activeUser, setActiveUser] = useState<UserProps | null>(null);

  const PAGE_SIZES = [10, 15, 20];
  const [pageSize, setPageSize] = useState(PAGE_SIZES[1]);
  const [page, setPage] = useState(1);
  const [displayUsers, setDisplayUsers] = useState<any[]>([]);

  const [sortedUsers, setSortedUsers] = useState(users);
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<UserProps>>({
    columnAccessor: 'id',
    direction: 'asc',
  });

  const [sendBatchEmailModalOpened, sendBatchEmailModal] = useDisclosure(false);
  const [selectedUsers, setSelectedUsers] = useState<UserProps[]>([]);

  useEffect(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    setDisplayUsers(sortedUsers.slice(start, end));
  }, [page]);

  useEffect(() => {
    setPage(1);
    setDisplayUsers(sortedUsers.slice(0, pageSize));
  }, [pageSize]);

  useEffect(() => {
    setPage(1);
    setDisplayUsers(sortedUsers.slice(0, pageSize));
  }, [sortedUsers]);

  useEffect(() => {
    setSortedUsers(sortData(users, {
      sortBy: sortStatus.columnAccessor as keyof UserProps,
      reversed: sortStatus.direction === 'desc',
      search
    }));
  }, [search, sortStatus]);

  const getUserHandler = async () => {
    try {
      const res = await getUsers();
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      setUsers(data.data);
      setSortedUsers(data.data);
    } catch (error) {
      openRetryModal("用户列表获取失败", `${error}`, getUserHandler)
    } finally {
      setFetching(false);
    }
  }

  const deleteUsersHandler = async () => {
    try  {
      const res = await deleteUsers({
        ids: selectedUsers.map((user) => user.id),
      })
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      openAlertModal("删除成功", `所选的 ${selectedUsers.length} 名用户已经被删除。`);
      selectedUsers.forEach((user) => {
        const index = users.findIndex((u) => u.id === user.id);
        users.splice(index, 1);
        setUsers(users);
        setSortedUsers(sortData(users, {
          sortBy: sortStatus.columnAccessor as keyof UserProps,
          reversed: sortStatus.direction === 'desc',
          search
        }));
        setSelectedUsers([]);
      });
    } catch (error) {
      openRetryModal("删除失败", `${error}`, deleteUsersHandler);
    }
  }

  useEffect(() => {
    getUserHandler();
  }, []);

  const { width } = useViewportSize();

  return (
    <div>
      <EditUserModal user={activeUser as UserProps} opened={editUserModalOpened} close={() => {
        const index = users.findIndex((user) => user.id === activeUser?.id);
        users.splice(index, 1);
        if (activeUser?.deleted != true) {
          users.push(activeUser as UserProps);
        }
        const newUsers = users.sort((a, b) => a.id - b.id);
        setUsers(newUsers);
        setSortedUsers(newUsers);

        editUserModal.close();
      }} />
      <SendBatchEmailModal users={selectedUsers} opened={sendBatchEmailModalOpened} close={() => {
        sendBatchEmailModal.close();
      }} />
      <TextInput
        placeholder="搜索用户"
        radius="md"
        mb="md"
        leftSection={<IconSearch size={18} />}
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
      />
      <Card className={classes.card} withBorder radius="md" w={width > NAVBAR_BREAKPOINT ? `100%` : width - 32} p={0}>
        <Card.Section className={classes.section} m={0}>
          <Text size="sm" mb="xs">对所选的 {selectedUsers.length} 名用户进行操作：</Text>
          <Group>
            <Button variant="filled" leftSection={<IconSend size={20} />} disabled={selectedUsers.length === 0} onClick={() => {
              sendBatchEmailModal.open();
            }}>群发邮件</Button>
            <Button variant="outline" color="red" leftSection={<IconTrash size={20} />} onClick={() => {
              openConfirmModal("删除用户", `你确定要删除所选的 ${selectedUsers.length} 名用户吗？`, deleteUsersHandler, {
                confirmProps: { color: 'red' }
              });
            }} disabled={selectedUsers.length === 0}>
              删除
            </Button>
          </Group>
        </Card.Section>
        <DataTable highlightOnHover striped
          verticalSpacing="xs"
          mih={users.length === 0 ? 150 : 0}
          emptyState={
            <Flex gap="xs" align="center" direction="column" c="dimmed">
              <IconDatabaseOff size={48} stroke={1.5} />
              <Text fz="sm">没有记录</Text>
            </Flex>
          }
          // 数据
          columns={[
            {
              accessor: 'id',
              title: 'ID',
              width: 50,
              sortable: true,
            },
            {
              accessor: 'name',
              title: '用户名',
              width: 100,
              ellipsis: true,
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
              width: 150,
              render: ({ permission }) => {
                return <Group gap="xs">
                  {permissionToList(permission-UserPermission.User).map((permission) => (
                    <Badge variant="default" key={permission}>{{
                      1: '普通用户',
                      2: '开发者',
                      4: '管理员',
                    }[permission]}</Badge>
                  ))}
                </Group>;
              },
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
          totalRecords={sortedUsers.length}
          noRecordsText="没有记录"
          // 筛选
          sortStatus={sortStatus}
          onSortStatusChange={setSortStatus}
          // 弹窗
          onRowClick={({ record }) => {
            setActiveUser(record);
            editUserModal.open();
          }}
          // 分页
          recordsPerPage={pageSize}
          paginationText={({ from, to, totalRecords}) => {
            return `${from}-${to} 名用户，共 ${totalRecords} 名`;
          }}
          page={page}
          onPageChange={(p) => setPage(p)}
          recordsPerPageOptions={PAGE_SIZES}
          recordsPerPageLabel="每页显示"
          onRecordsPerPageChange={setPageSize}
          // 选择
          selectedRecords={selectedUsers}
          onSelectedRecordsChange={setSelectedUsers}
          allRecordsSelectionCheckboxProps={{
            indeterminate: selectedUsers.length > 0 && selectedUsers.length < sortedUsers.length,
            checked: users.length > 0 && selectedUsers.length === sortedUsers.length,
            onChange: () => {
              if (selectedUsers.length === sortedUsers.length) {
                setSelectedUsers([]);
              } else {
                setSelectedUsers(sortedUsers);
              }
            },
          }}
          // 其它
          fetching={fetching}
        />
      </Card>
    </div>
  )
}

export default function AdminUsers() {
  return (
    <Page
      meta={{
        title: "管理用户",
        description: "查看并管理 maimai DX 查分器的用户",
      }}
      children={<AdminUsersContent />}
    />
  )
}