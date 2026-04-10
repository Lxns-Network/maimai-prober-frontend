import { useEffect, useMemo, useState } from 'react';
import {
  Box, Card, Text, Group, Button, Flex, Stack, ActionIcon, Grid, SimpleGrid,
  CopyButton, Tooltip, Code, TextInput
} from '@mantine/core';
import { DataTable, DataTableSortStatus } from 'mantine-datatable';
import {
  IconPlus, IconTrash, IconPlayerStop, IconPlayerPlay, IconCopy, IconCheck,
  IconDatabaseOff, IconEdit, IconServer, IconWifi, IconSubtask
} from '@tabler/icons-react';
import { useViewportSize } from '@mantine/hooks';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createWorker, updateWorker, deleteWorker } from '@/utils/api/admin.ts';
import { openConfirmModal, openRetryModal, openFormModal, openAlertModal } from '@/utils/modal.tsx';
import classes from '@/pages/Page.module.css';
import workerClasses from './WorkersSection.module.css';

interface WorkerProps {
  id: number;
  name: string;
  token: string;
  enabled: boolean;
  create_time: string;
  online: boolean;
  version: string;
  active_tasks: number;
  max_concurrent_tasks: number;
  remote_addr: string;
}

function sortData(
  data: WorkerProps[],
  payload: { sortBy: keyof WorkerProps | null; reversed: boolean }
) {
  const { sortBy } = payload;

  if (!sortBy) {
    return [...data];
  }

  return [...data].sort((a, b) => {
    if (typeof a[sortBy] === 'string') {
      if (payload.reversed) {
        return (b[sortBy] as string).localeCompare(a[sortBy] as string);
      }
      return (a[sortBy] as string).localeCompare(b[sortBy] as string);
    } else {
      if (payload.reversed) {
        return (b[sortBy] as number) - (a[sortBy] as number);
      }
      return (a[sortBy] as number) - (b[sortBy] as number);
    }
  });
}

const TextInputWithCopyButton = ({ label, value }: { label: string, value: string }) => {
  return (
    <TextInput
      label={label}
      value={value}
      rightSection={
        <CopyButton value={value} timeout={2000}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? '已复制' : '复制'} withArrow position="right">
              <ActionIcon variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                {copied ? <IconCheck size={20} /> : <IconCopy size={20} />}
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
      }
      readOnly
    />
  );
};

const TokenDisplay = ({ token }: { token: string }) => {
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">
        请妥善保存此 Token，它只会在创建时显示一次。
      </Text>
      <Group gap="xs" wrap="nowrap">
        <Code block style={{ flex: 1, wordBreak: 'break-all' }}>{token}</Code>
        <CopyButton value={token} timeout={2000}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? '已复制' : '复制'}>
              <ActionIcon color={copied ? 'teal' : 'gray'} variant="subtle" onClick={copy}>
                {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
      </Group>
    </Stack>
  );
};

const QUERY_KEY = ['user/admin/workers'] as const;

const emptyWorkers: WorkerProps[] = [];

const StatCard = ({ icon, label, value, color }: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  color: string;
}) => (
  <Card withBorder radius="md" className={classes.card} p="md">
    <Group gap="sm" wrap="nowrap">
      <Box c={color}>{icon}</Box>
      <div>
        <Text fz="xs" c="dimmed">{label}</Text>
        <Text fz="lg" fw={700}>{value}</Text>
      </div>
    </Group>
  </Card>
);

export const WorkersSection = () => {
  const queryClient = useQueryClient();
  const { data: workers = emptyWorkers, isLoading } = useQuery<WorkerProps[]>({
    queryKey: QUERY_KEY,
    refetchInterval: 5000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: QUERY_KEY });

  const stats = useMemo(() => {
    const total = workers.length;
    const online = workers.filter(w => w.online && w.enabled).length;
    const activeTasks = workers.reduce((sum, w) => sum + (w.online ? w.active_tasks : 0), 0);
    const maxTasks = workers.reduce((sum, w) => sum + (w.online ? w.max_concurrent_tasks : 0), 0);
    return { total, online, activeTasks, maxTasks };
  }, [workers]);

  const PAGE_SIZES = [10, 15, 20];
  const [pageSize, setPageSize] = useState(PAGE_SIZES[1]);
  const [page, setPage] = useState(1);
  const [displayWorkers, setDisplayWorkers] = useState<WorkerProps[]>([]);

  const [sortedWorkers, setSortedWorkers] = useState<WorkerProps[]>([]);
  const [sortStatus, setSortStatus] = useState<DataTableSortStatus<WorkerProps>>({
    columnAccessor: 'id',
    direction: 'asc',
  });

  const [selectedWorkers, setSelectedWorkers] = useState<WorkerProps[]>([]);
  const [expandedWorkerIds, setExpandedWorkerIds] = useState<number[]>([]);

  useEffect(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    setDisplayWorkers(sortedWorkers.slice(start, end));
  }, [page]);

  useEffect(() => {
    setPage(1);
    setDisplayWorkers(sortedWorkers.slice(0, pageSize));
  }, [pageSize]);

  useEffect(() => {
    setPage(1);
    setDisplayWorkers(sortedWorkers.slice(0, pageSize));
  }, [sortedWorkers]);

  useEffect(() => {
    setSortedWorkers(sortData(workers, {
      sortBy: sortStatus.columnAccessor as keyof WorkerProps,
      reversed: sortStatus.direction === 'desc',
    }));
  }, [workers, sortStatus]);

  const handleCreate = () => {
    openFormModal(
      "创建工作节点",
      "为新的工作节点指定一个名称。",
      { label: "名称", placeholder: "例如：Worker A", required: true },
      async (value) => {
        try {
          const res = await createWorker({ name: value });
          const data = await res.json();
          if (!data.success) {
            throw new Error(data.message || '创建失败');
          }
          openAlertModal("工作节点创建成功", <TokenDisplay token={data.data.token} />);
          invalidate();
        } catch (error) {
          openRetryModal("创建失败", `${error}`, () => handleCreate());
        }
      }
    );
  };

  const handleRename = (worker: WorkerProps) => {
    openFormModal(
      "重命名工作节点",
      "",
      { label: "名称", placeholder: "输入新名称", defaultValue: worker.name, required: true },
      async (value) => {
        try {
          const res = await updateWorker(worker.id, { name: value });
          const data = await res.json();
          if (!data.success) {
            throw new Error(data.message || '重命名失败');
          }
          invalidate();
        } catch (error) {
          openRetryModal("重命名失败", `${error}`, () => handleRename(worker));
        }
      }
    );
  };

  const handleToggleEnabled = async (worker: WorkerProps) => {
    try {
      const res = await updateWorker(worker.id, { enabled: !worker.enabled });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || '操作失败');
      }
      invalidate();
    } catch (error) {
      openRetryModal("操作失败", `${error}`, () => handleToggleEnabled(worker));
    }
  };

  const handleDelete = (worker: WorkerProps) => {
    openConfirmModal("删除工作节点", `确定要删除工作节点「${worker.name}」吗？删除后将断开连接并移除记录。`, async () => {
      try {
        const res = await deleteWorker(worker.id);
        const data = await res.json();
        if (!data.success) {
          throw new Error(data.message || '删除失败');
        }
        invalidate();
      } catch (error) {
        openRetryModal("删除失败", `${error}`, () => handleDelete(worker));
      }
    }, { confirmProps: { color: 'red' } });
  };

  const handleBatchDelete = () => {
    openConfirmModal("批量删除工作节点", `确定要删除所选的 ${selectedWorkers.length} 个工作节点吗？`, async () => {
      try {
        for (const worker of selectedWorkers) {
          const res = await deleteWorker(worker.id);
          const data = await res.json();
          if (!data.success) {
            throw new Error(data.message || '删除失败');
          }
        }
        openAlertModal("删除成功", `所选的 ${selectedWorkers.length} 个工作节点已被删除。`);
        setSelectedWorkers([]);
        invalidate();
      } catch (error) {
        openRetryModal("删除失败", `${error}`, handleBatchDelete);
      }
    }, { confirmProps: { color: 'red' } });
  };

  const { width } = useViewportSize();

  return (
    <div style={{ position: 'relative' }}>
      <SimpleGrid cols={{ base: 2, sm: 3 }} mb="md">
        <StatCard
          icon={<IconServer size={24} stroke={1.5} />}
          label="节点总数"
          value={`${stats.online} / ${stats.total}`}
          color="blue"
        />
        <StatCard
          icon={<IconWifi size={24} stroke={1.5} />}
          label="在线节点"
          value={stats.online}
          color="green"
        />
        <StatCard
          icon={<IconSubtask size={24} stroke={1.5} />}
          label="活跃任务"
          value={`${stats.activeTasks} / ${stats.maxTasks}`}
          color="orange"
        />
      </SimpleGrid>
      <Card className={classes.card} withBorder radius="md" w={width > 700 ? '100%' : width - 32} p={0}>
        <Card.Section className={classes.section} m={0}>
          <Group justify="space-between">
            <Text size="sm">对所选的 {selectedWorkers.length} 个工作节点进行操作：</Text>
            <Group>
              <Button variant="outline" color="red" leftSection={<IconTrash size={20} />}
                disabled={selectedWorkers.length === 0} onClick={handleBatchDelete}>
                删除
              </Button>
              <Button leftSection={<IconPlus size={18} />} onClick={handleCreate}>
                创建工作节点
              </Button>
            </Group>
          </Group>
        </Card.Section>
        <DataTable
          highlightOnHover
          striped
          verticalSpacing="xs"
          mih={displayWorkers.length === 0 ? 150 : 0}
          emptyState={
            <Flex gap="xs" align="center" direction="column" c="dimmed">
              <IconDatabaseOff size={48} stroke={1.5} />
              <Text fz="sm">暂无工作节点</Text>
            </Flex>
          }
          columns={[
            {
              accessor: 'id',
              title: 'ID',
              width: 50,
              sortable: true,
            },
            {
              accessor: 'name',
              title: '名称',
              width: 150,
              sortable: true,
              render: ({ id, name, online, enabled }) => (
                <Group gap="xs" wrap="nowrap">
                  <Box
                    className={workerClasses.statusDot}
                    bg={!enabled ? 'red' : online ? 'green' : 'gray'}
                    data-online={enabled && online}
                  />
                  <Text fz="sm" truncate>{id === 0 ? '本地节点' : name}</Text>
                </Group>
              ),
            },
            {
              accessor: 'version',
              title: '版本',
              width: 80,
              render: ({ online, version }) => online ? version || '-' : '-',
            },
            {
              accessor: 'active_tasks',
              title: '任务',
              width: 80,
              render: ({ online, active_tasks, max_concurrent_tasks }) =>
                online ? `${active_tasks} / ${max_concurrent_tasks}` : '-',
            },
            {
              accessor: 'create_time',
              title: '创建时间',
              width: 150,
              render: ({ id, create_time }) => id === 0 ? '-' : new Date(create_time).toLocaleString(),
              sortable: true,
            },
            {
              accessor: 'actions',
              title: <Box mr={6}>操作</Box>,
              width: 100,
              textAlign: 'right',
              render: (worker) => {
                const isLocal = worker.id === 0;
                return (
                <Group gap={4} justify="right" wrap="nowrap">
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="blue"
                    disabled={isLocal}
                    onClick={(e) => { e.stopPropagation(); handleRename(worker); }}
                  >
                    <IconEdit size={16} />
                  </ActionIcon>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color={worker.enabled ? 'orange' : 'green'}
                    disabled={isLocal}
                    onClick={(e) => { e.stopPropagation(); handleToggleEnabled(worker); }}
                  >
                    {worker.enabled ? <IconPlayerStop size={16} /> : <IconPlayerPlay size={16} />}
                  </ActionIcon>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    color="red"
                    disabled={isLocal}
                    onClick={(e) => { e.stopPropagation(); handleDelete(worker); }}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
                );
              },
            },
          ]}
          records={displayWorkers}
          totalRecords={sortedWorkers.length}
          noRecordsText="暂无工作节点"
          sortStatus={sortStatus}
          onSortStatusChange={setSortStatus}
          recordsPerPage={pageSize}
          paginationText={({ from, to, totalRecords }) =>
            `${from}-${to} 个工作节点，共 ${totalRecords} 个`
          }
          page={page}
          onPageChange={(p) => setPage(p)}
          recordsPerPageOptions={PAGE_SIZES}
          recordsPerPageLabel="每页显示"
          onRecordsPerPageChange={setPageSize}
          rowExpansion={{
            allowMultiple: true,
            trigger: 'click',
            expanded: {
              recordIds: expandedWorkerIds,
              onRecordIdsChange: (ids: unknown[]) => setExpandedWorkerIds((ids as number[]).filter(id => id !== 0)),
            },
            content: ({ record }) => (
              <Box p="md">
                <Grid>
                  <Grid.Col span={6}>
                    <TextInputWithCopyButton label="Token" value={record.token} />
                  </Grid.Col>
                  <Grid.Col span={6}>
                    <TextInputWithCopyButton label="远程地址" value={record.online ? record.remote_addr || '-' : '-'} />
                  </Grid.Col>
                </Grid>
              </Box>
            ),
          }}
          isRecordSelectable={(record) => record.id !== 0}
          selectedRecords={selectedWorkers}
          onSelectedRecordsChange={setSelectedWorkers}
          allRecordsSelectionCheckboxProps={{
            indeterminate: selectedWorkers.length > 0 && selectedWorkers.length < sortedWorkers.filter(w => w.id !== 0).length,
            checked: sortedWorkers.filter(w => w.id !== 0).length > 0 && selectedWorkers.length === sortedWorkers.filter(w => w.id !== 0).length,
            onChange: () => {
              const selectableWorkers = sortedWorkers.filter(w => w.id !== 0);
              if (selectedWorkers.length === selectableWorkers.length) {
                setSelectedWorkers([]);
              } else {
                setSelectedWorkers(selectableWorkers);
              }
            },
          }}
          fetching={isLoading}
        />
      </Card>
    </div>
  );
};
