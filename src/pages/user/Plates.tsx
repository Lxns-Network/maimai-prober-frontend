import { useEffect, useState } from "react";
import { getPlateList, getPlayerPlateById } from "../../utils/api/player";
import {
  Container,
  Group,
  Loader,
  Text,
  Title,
  Card,
  Image,
  Space,
  ThemeIcon,
  Box, Checkbox, Combobox, InputBase, Input, useCombobox, ScrollArea, Flex
} from "@mantine/core";
import Icon from "@mdi/react";
import { mdiCheck } from "@mdi/js";
import { DataTable } from "mantine-datatable";
import { NAVBAR_BREAKPOINT } from "../../App";
import { IconCheck, IconDatabaseOff } from "@tabler/icons-react";
import { useToggle } from "@mantine/hooks";
import classes from "../Page.module.css"

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
  const [defaultPlates, setDefaultPlates] = useState<PlateDataProps[]>([]);
  const [plates, setPlates] = useState<PlateDataProps[]>([]);
  const [plateId, setPlateId] = useState<number | null>(null);
  const [plate, setPlate] = useState<PlateDataProps | null>(null);
  const [fetching, setFetching] = useState<boolean>(false);
  const [onlySongRequired, toggleOnlySongRequired] = useToggle();
  // const [game] = useLocalStorage({ key: 'game', defaultValue: 'maimai' })
  const game = 'maimai';

  const getPlateListHandler = async () => {
    try {
      const res = await getPlateList(game, false);
      const data = await res.json();
      setDefaultPlates(data.plates);
      setPlates(data.plates);
    } catch (err) {
      console.error(err);
    }
  }

  const getPlayerPlateByIdHandler = async (id: number) => {
    try {
      const res = await getPlayerPlateById(game, id);
      const data = await res.json();
      if (!data.success) {
        setPlate(plates.find((plate) => plate.id === id) || null);
        throw new Error(data.message);
      }
      setPlate(data.data);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    document.title = "姓名框查询 | maimai DX 查分器";

    getPlateListHandler();
  }, []);

  useEffect(() => {
    plateId && getPlayerPlateByIdHandler(plateId);
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

  useEffect(() => {
    setPlates(defaultPlates.filter((plate) => {
      // return !((!plate.required || plate.required.length === 0) && onlySongRequired);
      if (onlySongRequired) return plate.description.search("全曲") !== -1;
      return true;
    }))
  }, [onlySongRequired]);

  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  return (
    <>
      <Container className={classes.root} size={500}>
        <Title order={2} size="h2" fw={900} ta="center" mt="xs">
          姓名框查询
        </Title>
        <Text c="dimmed" size="sm" ta="center" mt="sm" mb={26}>
          查询 maimai DX 姓名框与你的姓名框获取进度
        </Text>
        {!plates ? (
          <Group justify="center" mt="xl">
            <Loader />
          </Group>
        ) : (
          <>
            <Combobox
              store={combobox}
              onOptionSubmit={(value) => {
                setPlateId(parseInt(value || ''));
                combobox.closeDropdown();
              }}
              transitionProps={{ transition: 'fade', duration: 100, timingFunction: 'ease' }}
            >
              <Combobox.Target>
                <InputBase
                  component="button"
                  type="button"
                  pointer
                  rightSection={<Combobox.Chevron />}
                  onClick={() => combobox.toggleDropdown()}
                  rightSectionPointerEvents="none"
                  radius="md"
                  multiline
                >
                  {plate ? (
                    <Text>
                      {plate.name}
                    </Text>
                  ) : (
                    <Input.Placeholder>请选择姓名框</Input.Placeholder>
                  )}
                </InputBase>
              </Combobox.Target>

              <Combobox.Dropdown>
                <Combobox.Options>
                  <ScrollArea.Autosize mah={200} type="scroll">
                    {plates.map((plate) => (
                      <Combobox.Option value={plate.id.toString()} key={plate.id}>
                        <Text fz="sm" fw={500}>
                          {plate.name}
                        </Text>
                        <Text fz="xs" opacity={0.6}>
                          {plate.description}
                        </Text>
                      </Combobox.Option>
                    ))}
                  </ScrollArea.Autosize>
                </Combobox.Options>
              </Combobox.Dropdown>
            </Combobox>
            <Space h="xs" />
            <Checkbox
              label="仅显示要求曲目的姓名框"
              onChange={() => toggleOnlySongRequired()}
            />
            <Card mt="md" radius="md" p="md" withBorder className={classes.card}>
              <Group justify="space-between">
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
              <Image src={`https://assets.lxns.net/maimai/plate/${plate ? plate.id : 0}.png!webp`} />
            </Card>
          </>
        )}
      </Container>
      <Container mb="md">
        <Box w={window.innerWidth > NAVBAR_BREAKPOINT ? `100%` : "calc(100vw - 32px)"}>
          <DataTable withTableBorder striped
            borderRadius="md"
            verticalSpacing="xs"
            mih={records.length === 0 ? 150 : 0}
            emptyState={
              <Flex gap="xs" align="center" direction="column" c="dimmed">
                <IconDatabaseOff size={48} stroke={1.5} />
                <Text fz="sm">无要求曲目</Text>
              </Flex>
            }
            // 数据
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
                    <IconCheck color="#4caf50" />
                  </Group>
                )),
              })),
            ]}
            records={displayRecords}
            totalRecords={records.length}
            noRecordsText="无要求曲目"
            // 分页
            recordsPerPage={pageSize}
            paginationText={({ from, to, totalRecords}) => {
              return `${from}-${to} 首曲目，共 ${totalRecords} 首`;
            }}
            page={page}
            onPageChange={(p) => setPage(p)}
            recordsPerPageOptions={PAGE_SIZES}
            recordsPerPageLabel="每页显示"
            onRecordsPerPageChange={setPageSize}
            // 其它
            fetching={fetching}
          />
        </Box>
      </Container>
    </>
  );
}