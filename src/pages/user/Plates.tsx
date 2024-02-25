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
  Box,
  Checkbox,
  Combobox,
  InputBase,
  Input,
  useCombobox,
  ScrollArea,
  SegmentedControl,
  SimpleGrid,
  Badge,
  Pagination, rem, LoadingOverlay
} from "@mantine/core";
import Icon from "@mdi/react";
import { mdiCheck } from "@mdi/js";
import { IconCheck } from "@tabler/icons-react";
import { useMediaQuery, useToggle } from "@mantine/hooks";
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
  const [onlySongRequired, toggleOnlySongRequired] = useToggle();
  // const [game] = useLocalStorage({ key: 'game', defaultValue: 'maimai' })
  const small = useMediaQuery(`(max-width: 450px)`);
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
  const [difficulty, setDifficulty] = useState<number | null>(null);

  useEffect(() => {
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

  const pageSize = 20;
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
            <Text c="dimmed" size="xs" tt="uppercase" fw={700}>
              {plate ? plate.description : "请选择姓名框"}
            </Text>
            <Text fw={700} size="xl">
              {plate ? plate.name : "请选择姓名框"}
            </Text>
            <Space h="md" />
            <Image src={`https://assets.lxns.net/maimai/plate/${plate ? plate.id : 0}.png!webp`} />
          </Card>
        </>
      )}
      {displayRecords.length !== 0 && (
        <Card mt="md" radius="md" p="md" withBorder className={classes.card}>
          <Group justify="space-between">
            <div>
              <Text fz="lg" fw={700}>
                要求曲目
              </Text>
              <Text c="dimmed" size="xs">
                查询姓名框要求曲目的完成度
              </Text>
            </div>
            {plate && plate.required && plate.required.every((required) => required.completed) && (
              <ThemeIcon variant="light" color="teal" size="xl" radius="xl">
                <Icon path={mdiCheck} size={10} />
              </ThemeIcon>
            )}
          </Group>
          <Space h="md" />
          <Group grow align="flex-start" h={40}>
            <div>
              <Text fz="xs" c="dimmed">曲目范围</Text>
              <Text fz="sm">{((plate && plate.description) || "").split("/")[0]}</Text>
            </div>
            {plate && plate.required && plate.required[0].fc && (
              <div>
                <Text fz="xs" c="dimmed">FULL COMBO 要求</Text>
                <Image w={rem(30)} ml={-3} src={`/assets/maimai/music_icon/${plate.required[0].fc}.webp`} />
              </div>
            )}
            {plate && plate.required && plate.required[0].fs && (
              <div>
                <Text fz="xs" c="dimmed">FULL SYNC 要求</Text>
                <Image w={rem(30)} ml={-3} src={`/assets/maimai/music_icon/${plate.required[0].fs}.webp`} />
              </div>
            )}
            {plate && plate.required && plate.required[0].rate && (
              <div>
                <Text fz="xs" c="dimmed">达成率要求</Text>
                <Image w={rem(64)} ml={-8} src={`/assets/maimai/music_rank/${plate.required[0].rate}.webp`} />
              </div>
            )}
          </Group>
          <Space h="md" />
          <Text fz="xs" c="dimmed" mb={4}>要求难度</Text>
          <SegmentedControl orientation={
            small ? "vertical" : "horizontal"
          } size="xs" fullWidth data={[
            ...difficulties.map((difficulty) => ({
              label: ['BASIC', 'ADVANCED', 'EXPERT', 'MASTER', 'Re:MASTER'][difficulty],
              value: difficulty.toString(),
            })),
          ]} value={difficulty?.toString()} onChange={(value) => setDifficulty(parseInt(value || ''))} />
          <Space h="lg" />
          <SimpleGrid cols={2}>
            {displayRecords.map((record) => (
              <Group key={record.id} wrap="nowrap" gap="xs">
                <Box pos="relative" h={40}>
                  <LoadingOverlay overlayProps={{ radius: "sm", backgroundOpacity: 0.9 }} visible={
                    record.completed_difficulties.includes(difficulty || 0)
                  } loaderProps={{ children: (
                    <ThemeIcon variant="light" color="teal" size={40}>
                      <IconCheck />
                    </ThemeIcon>
                  )}} />
                  <Image h={40} w={40} radius="sm" src={`https://assets.lxns.net/maimai/jacket/${record.id}.png!webp`} />
                </Box>
                <div>
                  <Text size="sm" fw={500} lineClamp={1}>
                    {record.title}
                  </Text>
                  {record.type === "standard" ? (
                    <Badge variant="filled" color="blue" size="sm">标准</Badge>
                  ) : (
                    <Badge variant="filled" color="orange" size="sm">DX</Badge>
                  )}
                </div>
              </Group>
            ))}
          </SimpleGrid>
          <Space h="md" />
          <Group justify="center">
            <Pagination size="sm" total={Math.ceil(records.length / pageSize)} value={page} onChange={(page) => setPage(page)} />
          </Group>
        </Card>
      )}
    </Container>
  );
}