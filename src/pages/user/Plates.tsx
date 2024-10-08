import { useEffect, useState } from "react";
import { getPlateById, getPlateList, getPlayerPlateById } from "@/utils/api/player.ts";
import { Text, Card, Image, Space, Checkbox, Flex, Transition, AspectRatio } from "@mantine/core";
import { useToggle } from "@mantine/hooks";
import classes from "../Page.module.css"
import { RequiredSong } from "@/components/Plates/RequiredSong";
import { PlateCombobox } from "@/components/Plates/PlateCombobox";
import { IconPlaylist, IconPlaylistOff } from "@tabler/icons-react";
import { openRetryModal } from "@/utils/modal.tsx";
import { LoginAlert } from "@/components/LoginAlert";
import { ASSET_URL } from "@/main.tsx";
import { Page } from "@/components/Page/Page.tsx";

interface RequiredSongDataProps {
  id: number;
  title: string;
  type: string;
  completed?: boolean;
  completed_difficulties?: number[];
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

const PlatesContent = () => {
  const [defaultPlates, setDefaultPlates] = useState<PlateDataProps[]>([]);
  const [plates, setPlates] = useState<PlateDataProps[]>([]);
  const [plateId, setPlateId] = useState<number | null>(null);
  const [plate, setPlate] = useState<PlateDataProps | null>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [onlyRequired, toggleOnlyRequired] = useToggle();
  const isLoggedOut = !Boolean(localStorage.getItem("token"));
  const game = 'maimai';

  const getPlateListHandler = async () => {
    try {
      const res = await getPlateList(game, false);
      const data = await res.json();
      setDefaultPlates(data.plates);
      setPlates(data.plates);
    } catch (error) {
      openRetryModal("姓名框列表获取失败", `${error}`, () => getPlateListHandler());
    }
  }

  const getPlateHandler = async (id: number) => {
    try {
      const res = await getPlateById(game, id);
      const data = await res.json();
      setPlate(data);
    } catch (error) {
      openRetryModal("姓名框获取失败", `${error}`, () => getPlateHandler(id));
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
    } catch (error) {
      openRetryModal("姓名框获取失败", `${error}`, () => getPlayerPlateHandler(id));
    }
  }

  useEffect(() => {
    getPlateListHandler();
  }, []);

  useEffect(() => {
    if (!plateId) return;

    if (!isLoggedOut) {
      getPlayerPlateHandler(plateId);
    } else {
      getPlateHandler(plateId);
    }
  }, [plateId]);

  useEffect(() => {
    if (!plate || !plate.required) {
      setRecords([]);
      return;
    }

    let mergedRequiredSongs = plate.required.map((required) => required.songs).flat();
    // 去重并合并 completed_difficulties
    mergedRequiredSongs = mergedRequiredSongs.reduce((acc: RequiredSongDataProps[], song) => {
      const existing = acc.find((existingSong) => {
        return existingSong.id === song.id && existingSong.type === song.type;
      })
      if (existing) {
        if (!existing.completed_difficulties) existing.completed_difficulties = [];
        existing.completed_difficulties = [
          ...new Set([...existing.completed_difficulties, ...(song.completed_difficulties || [])]),
        ];
        return acc;
      }
      return [...acc, song];
    }, []);

    const convertedRecords = [
      ...(mergedRequiredSongs && mergedRequiredSongs.length > 0
        ? mergedRequiredSongs.map((song) => {
          if (!song.completed_difficulties) return song;

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
    <div>
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
      <Transition
        mounted={Boolean(plate)}
        transition="pop"
        timingFunction="ease"
      >
        {(styles) => (
          <Card radius="md" mt="md" p="md" withBorder className={classes.card} style={styles}>
            <Text c="dimmed" size="xs" tt="uppercase" fw={700}>
              {plate && plate.description}
            </Text>
            <Text fw={700} size="xl">
              {plate && plate.name}
            </Text>
            <Space h="md" />
            <AspectRatio ratio={720 / 116}>
              <Image src={`${ASSET_URL}/maimai/plate/${plate ? plate.id : 0}.png!webp`} />
            </AspectRatio>
          </Card>
        )}
      </Transition>
      <Space h="md" />
      <LoginAlert content="你需要登录查分器账号才能查看你的姓名框获取进度。" mb="md" radius="md" />
      {!plate ? (
        <Flex gap="xs" align="center" direction="column" c="dimmed" mt="xl" mb="xl">
          <IconPlaylist size={64} stroke={1.5} />
          <Text fz="sm">请选择一个姓名框来查看要求曲目</Text>
        </Flex>
      ) : !plate.required && (
        <Flex gap="xs" align="center" direction="column" c="dimmed" mt="xl" mb="xl">
          <IconPlaylistOff size={64} stroke={1.5} />
          <Text fz="sm">此姓名框没有要求曲目</Text>
        </Flex>
      )}
      <Transition
        mounted={Boolean(plate && plate.required)}
        transition="pop"
        timingFunction="ease"
      >
        {(styles) => (
          <RequiredSong plate={plate} records={records} style={styles} />
        )}
      </Transition>
    </div>
  )
}

export default function Plates() {
  return (
    <Page
      meta={{
        title: "姓名框查询",
        description: "查询「舞萌 DX」姓名框与你的姓名框获取进度",
      }}
      children={<PlatesContent />}
    />
  )
}