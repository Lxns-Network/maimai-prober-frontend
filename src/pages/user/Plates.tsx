import { useEffect, useState } from "react";
import { getPlateList, getPlayerPlateById } from "../../utils/api/player";
import {
  Container,
  Text,
  Title,
  Card,
  Image,
  Space,
  Checkbox,
} from "@mantine/core";
import { useToggle } from "@mantine/hooks";
import classes from "../Page.module.css"
import { RequiredSong } from "../../components/Plates/RequiredSong";
import { PlateCombobox } from "../../components/Plates/PlateCombobox";

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

export interface PlateDataProps {
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
  const [records, setRecords] = useState<any[]>([]);
  const [onlyRequired, toggleOnlyRequired] = useToggle();
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

  const getPlayerPlateHandler = async (id: number) => {
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
    plateId && getPlayerPlateHandler(plateId);
  }, [plateId]);

  useEffect(() => {
    if (!plate || plate.required === undefined) {
      setRecords([]);
      return;
    }

    const mergedRequiredSongs = plate.required.map((required) => required.songs).flat();
    const convertedRecords = [
      ...(mergedRequiredSongs && mergedRequiredSongs.length > 0
        ? mergedRequiredSongs.map((song) => {
          const record = { ...song };
          song.completed_difficulties.forEach((difficulty) => {
            // @ts-ignore
            record[`difficulty_${difficulty}`] = true;
          });
          return record;
        })
        : []),
    ];

    setRecords(convertedRecords);
  }, [plate]);

  useEffect(() => {
    setPlates(defaultPlates.filter((plate) => {
      if (onlyRequired) return plate.description.search("全曲") !== -1;
      return true;
    }))
  }, [onlyRequired]);

  return (
    <Container className={classes.root} size={500}>
      <Title order={2} size="h2" fw={900} ta="center" mt="xs">
        姓名框查询
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt="sm" mb={26}>
        查询 maimai DX 姓名框与你的姓名框获取进度
      </Text>
      <PlateCombobox
        plates={plates}
        onOptionSubmit={(value) => setPlateId(value)}
        radius="md"
      />
      <Space h="xs" />
      <Checkbox
        label="仅显示要求曲目的姓名框"
        checked={onlyRequired}
        onChange={() => toggleOnlyRequired()}
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
      {plate && plate.required && (
        <RequiredSong plate={plate} records={records} />
      )}
    </Container>
  );
}