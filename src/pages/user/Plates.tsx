import React, { forwardRef, useEffect, useState } from "react";
import { getPlateList, getPlayerPlateById } from "../../utils/api/player";
import {
  Container,
  createStyles,
  Group,
  Loader,
  Text,
  Title,
  rem,
  Select,
  Card,
  Image,
  Space,
  ThemeIcon,
  Box
} from "@mantine/core";
import Icon from "@mdi/react";
import { mdiCheck, mdiMagnify } from "@mdi/js";
import { DataTable } from "mantine-datatable";
import { NAVBAR_BREAKPOINT } from "../../App";

const useStyles = createStyles((theme) => ({
  root: {
    padding: rem(16),
    maxWidth: rem(600),
  },

  card: {
    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
    color: theme.colorScheme === 'dark' ? theme.white : theme.colors.gray[9],
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

interface ItemProps extends React.ComponentPropsWithoutRef<'div'> {
  image: string;
  label: string;
  description: string;
}

const SelectItem = forwardRef<HTMLDivElement, ItemProps>(
  ({ image, label, description, ...others }: ItemProps, ref) => (
    <div ref={ref} {...others}>
      <Text size="sm">{label}</Text>
      <Text size="xs" opacity={0.65}>
        {description}
      </Text>
    </div>
  )
);

interface RequiredSongDataProps {
  id: number;
  title: string;
  type: string;
  completed: boolean;
  completed_difficulties: number[];
}

interface RequiredDataProps {
  completed: boolean;
  difficulties: number[];
  fc: string;
  fs: string;
  rate: string;
  songs: RequiredSongDataProps[];
}

interface PlateDataProps {
  id: number;
  name: string;
  description: string;
  required?: RequiredDataProps[];
}

export default function Plates() {
  const { classes } = useStyles();
  const [plates, setPlates] = useState<PlateDataProps[]>([]);
  const [plateId, setPlateId] = useState<number | null>(null);
  const [plate, setPlate] = useState<PlateDataProps | null>(null);
  const [fetching, setFetching] = useState<boolean>(false);
  //const [game] = useLocalStorage({ key: 'game', defaultValue: 'maimai' })
  const game = 'maimai';

  useEffect(() => {
    document.title = "姓名框查询 | maimai DX 查分器";

    const getPlates = async () => {
      const res = await getPlateList(game, false);
      if (res?.status !== 200) {
        return [];
      }
      return res.json();
    }

    getPlates()
      .then((data) => {
        setPlates(data.plates);
      });
  }, []);

  useEffect(() => {
    if (plateId === null) {
      return;
    }

    const getPlate = async () => {
      const res = await getPlayerPlateById(game, plateId as number);
      if (res?.status !== 200) {
        return [];
      }
      return res.json();
    }

    setFetching(true);
    getPlate().then((data) => {
      setPlate(data.data);
    });
  }, [plateId]);

  const [difficulties, setDifficulties] = useState<number[]>([]);
  const [records, setRecords] = useState<any[]>([]);

  useEffect(() => {
    setFetching(false);
    if (plate === null || plate.required === undefined) {
      setDifficulties([]);
      setRecords([]);
      setDisplayRecords([]);
      return;
    }
    const mergedDifficulties = plate.required.map((required) => required.difficulties).flat();
    setDifficulties(mergedDifficulties || []);

    const mergedRequiredSongs = plate.required.map((required) => required.songs).flat();
    const convertedRecords = [
      ...(mergedRequiredSongs && mergedRequiredSongs.length > 0
        ? mergedRequiredSongs.map((song) => {
          const record = { ...song };
          song.completed_difficulties.forEach((difficulty) => {
            // @ts-ignore
            record[`difficulty_${difficulty}` as keyof typeof record] = true;
          });
          return record;
        })
        : []),
    ];

    setDisplayRecords(convertedRecords.slice(0, pageSize));
    setRecords(convertedRecords);
  }, [plate]);

  const PAGE_SIZES = [10, 15, 20];
  const [pageSize, setPageSize] = useState(PAGE_SIZES[1]);
  const [page, setPage] = useState(1);
  const [displayRecords, setDisplayRecords] = useState<any[]>([]);

  useEffect(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    setDisplayRecords(records.slice(start, end));
  }, [page]);

  useEffect(() => {
    setPage(1);
    setDisplayRecords(records.slice(0, pageSize));
  }, [pageSize]);

  return (
    <>
      <Container className={classes.root} size={500}>
        <Title order={2} size="h2" weight={900} align="center" mt="xs">
          姓名框查询
        </Title>
        <Text color="dimmed" size="sm" align="center" mt="sm" mb="xl">
          查询 maimai DX 姓名框与你的牌子获取进度
        </Text>
        {plates === null ? (
          <Group position="center" mt="xl">
            <Loader />
          </Group>
        ) : (
          <>
            <Select
              radius="md"
              placeholder="请选择姓名框"
              itemComponent={SelectItem}
              icon={<Icon path={mdiMagnify} size={0.8} />}
              searchable
              filter={(query, item: any) =>
                item.label.toLowerCase().trim().includes(query.toLowerCase().trim()) ||
                item.description.toLowerCase().trim().includes(query.toLowerCase().trim())
              }
              data={plates ? plates.map((plate) => ({
                value: `${plate.id}`,
                label: plate.name,
                description: plate.description,
              })) : []}
              onChange={(value) => {
                setPlateId(parseInt(value || ''));
              }}
            />
            <Card mt="md" radius="md" p="md" withBorder className={classes.card}>
              <Group position="apart">
                <div>
                  <Text c="dimmed" size="xs" tt="uppercase" fw={700}>
                    {plate ? plate.description : "请选择姓名框"}
                  </Text>
                  <Text fw={700} size="xl">
                    {plate ? plate.name : "请选择姓名框"}
                  </Text>
                </div>
                {plate && plate.required && plate.required.every((required) => required.completed) && (
                  <ThemeIcon variant="light" color="teal" size="xl" radius="xl">
                    <Icon path={mdiCheck} size={10} />
                  </ThemeIcon>
                )}
              </Group>
              <Space h="md" />
              <Image src={`https://lxns.org/maimai/plate/${plate ? plate.id : 0}.png`} />
            </Card>
          </>
        )}
      </Container>
      <Container mb="md">
        <Box w={window.innerWidth > NAVBAR_BREAKPOINT ? `100%` : "calc(100vw - 32px)"}>
          <DataTable
            withBorder
            borderRadius="md"
            striped
            verticalSpacing="xs"
            mih={150}
            columns={[
              {
                accessor: 'title',
                title: '曲名',
                width: 200,
                ellipsis: true,
              },
              ...difficulties.map((difficulty) => ({
                accessor: `difficulty_${difficulty}`,
                title: ['BASIC', 'ADVANCED', 'EXPERT', 'MASTER', 'Re:MASTER'][difficulty],
                width: 100,
                render: (map: any) => (map[`difficulty_${difficulty}`] && (
                  <Group>
                    <Icon path={mdiCheck} size={0.8} color="#4caf50" />
                  </Group>
                )),
              })),
            ]}
            records={displayRecords}
            totalRecords={records.length}
            recordsPerPage={pageSize}
            paginationText={({ from, to, totalRecords}) => {
              return `${from}-${to} 首曲目，共 ${totalRecords} 首`;
            }}
            noRecordsText="无要求曲目"
            page={page}
            onPageChange={(p) => setPage(p)}
            recordsPerPageOptions={PAGE_SIZES}
            recordsPerPageLabel="每页显示"
            onRecordsPerPageChange={setPageSize}
            fetching={fetching}
          />
        </Box>
      </Container>
    </>
  );
}