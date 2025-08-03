import { useEffect, useState } from "react";
import { getCollectionById, getPlayerCollectionById } from "@/utils/api/player.ts";
import {
  Text, Card, Image, Space, Checkbox, Flex, Transition, AspectRatio, Group, Select, Badge, Center
} from "@mantine/core";
import { useToggle } from "@mantine/hooks";
import classes from "../Page.module.css"
import { RequiredSong } from "@/components/Plates/RequiredSong";
import { CollectionCombobox } from "@/components/Plates/CollectionCombobox.tsx";
import { IconPlaylist, IconPlaylistOff } from "@tabler/icons-react";
import { openRetryModal } from "@/utils/modal.tsx";
import { LoginAlert } from "@/components/LoginAlert";
import { Page } from "@/components/Page/Page.tsx";
import { useCollectionList } from "@/hooks/swr/useCollectionList.ts";
import { CollectionProps, CollectionRequiredSongProps } from "@/types/player";
import { getTrophyColor } from "@/utils/color.ts";
import { Marquee } from "@/components/Marquee.tsx";

const collectionTypeData = [
  { label: "姓名框", value: "plate" },
  { label: "称号", value: "trophy" },
  { label: "头像", value: "icon" },
  { label: "背景", value: "frame" },
];

const CollectionsContent = () => {
  const [collectionType, setCollectionType] = useState<string>("plate");
  const [displayCollectionType, setDisplayCollectionType] = useState<string>("plate");
  const isLoggedOut = !Boolean(localStorage.getItem("token"));
  const game = "maimai";

  const { collections } = useCollectionList(game, collectionType);
  const [filteredCollections, setFilteredCollections] = useState<CollectionProps[]>([]);
  const [collectionId, setCollectionId] = useState<number | null>(null);
  const [collection, setCollection] = useState<CollectionProps | null>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [onlyRequired, toggleOnlyRequired] = useToggle();

  const getCollectionHandler = async (id: number) => {
    try {
      const res = await getCollectionById(game, collectionType, id);
      const data = await res.json();
      setCollection(data);
    } catch (error) {
      openRetryModal("收藏品获取失败", `${error}`, () => getCollectionHandler(id));
    }
  }

  const getPlayerCollectionHandler = async (id: number) => {
    try {
      const res = await getPlayerCollectionById(game, collectionType, id);
      const data = await res.json();
      if (!data.success) {
        setCollection(filteredCollections.find((plate) => plate.id === id) || null);
        throw new Error(data.message);
      }
      setCollection(data.data);
    } catch (error) {
      openRetryModal("收藏品获取失败", `${error}`, () => getPlayerCollectionHandler(id));
    }
  }

  useEffect(() => {
    setFilteredCollections(collections);
  }, [collections]);

  useEffect(() => {
    if (!collectionId) return;

    setRecords([]); // 清空记录

    if (!isLoggedOut) {
      getPlayerCollectionHandler(collectionId);
    } else {
      getCollectionHandler(collectionId);
    }
  }, [collectionId]);

  useEffect(() => {
    setTimeout(() => {
      setDisplayCollectionType(collectionType);
    }, 300);
  }, [collectionType]);

  useEffect(() => {
    if (!collection || !collection.required) {
      setRecords([]);
      return;
    }

    let mergedRequiredSongs = collection.required.map((required) => required.songs).flat();
    // 去重并合并 completed_difficulties
    mergedRequiredSongs = mergedRequiredSongs.reduce((acc: CollectionRequiredSongProps[], song) => {
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
  }, [collection]);

  useEffect(() => {
    setFilteredCollections(collections.filter((collection) => {
      const description = collection.description || "";
      if (onlyRequired) return description.split("/").length === 3 && !description.includes("覚醒");
      return true;
    }));
  }, [collections, onlyRequired]);

  return (
    <div>
      <Group gap="xs" mb="xs">
        <Select
          data={collectionTypeData}
          value={collectionType}
          onChange={(value) => {
            setCollectionType(value as string);
            setCollectionId(null);
            setFilteredCollections([]);
          }}
          allowDeselect={false}
          w="30%"
          maw={150}
          radius="md"
          comboboxProps={{
            transitionProps: { transition: 'fade', duration: 100, timingFunction: 'ease' }
          }}
        />
        <CollectionCombobox
          collections={filteredCollections}
          onOptionSubmit={(value) => setCollectionId(value)}
          radius="md"
          style={{ flex: 1 }}
        />
      </Group>
      <Checkbox
        label="仅显示要求曲目的收藏品"
        checked={onlyRequired}
        onChange={() => toggleOnlyRequired()}
      />
      <Transition
        mounted={Boolean(collectionId && collection)}
        transition="pop"
        enterDelay={0}
      >
        {(styles) => (
          <Card radius="md" mt="md" p="md" withBorder className={classes.card} style={styles}>
            <Text c="dimmed" size="xs" tt="uppercase" fw={700}>
              {collection && collection.description}
            </Text>
            <Text fw={700} size="xl">
              {collection && collection.name}
            </Text>
            {collection && (
              <Center>
                {displayCollectionType === "plate" && (
                  <AspectRatio ratio={720 / 116} mt="md">
                    <Image src={`https://assets2.lxns.net/${game}/plate/${collection.id}.png`} w="100%" />
                  </AspectRatio>
                )}
                {displayCollectionType === "trophy" && (
                  <Badge
                    variant="light" size="xl" radius="xl" w="100%" mt="md"
                    color={getTrophyColor(collection.color || "normal")}
                    children={
                      <Marquee>
                        <Text fz="xl" style={{
                          whiteSpace: "pre-wrap"
                        }}>
                          {collection.name}
                        </Text>
                      </Marquee>
                    }
                  />
                )}
                {displayCollectionType === "icon" && (
                  <AspectRatio ratio={1} mt="md">
                    <Image src={`https://assets2.lxns.net/${game}/icon/${collection.id}.png`} w={128} />
                  </AspectRatio>
                )}
                {displayCollectionType === "frame" && collection.id !== 1 && (
                  <AspectRatio ratio={270 / 113} mt="md">
                    <Image src={`https://assets2.lxns.net/${game}/frame/${collection.id}.png`} w="100%" />
                  </AspectRatio>
                )}
              </Center>
            )}
          </Card>
        )}
      </Transition>
      <Space h="md" />
      <LoginAlert content="你需要登录查分器账号才能查看你的收藏品获取进度。" mb="md" radius="md" />
      <Transition
        mounted={Boolean(collectionId && collection && collection.required)}
        transition="pop"
        enterDelay={0}
      >
        {(styles) => (
          <RequiredSong collection={collection} records={records} style={styles} />
        )}
      </Transition>
      <Transition
        mounted={!collectionId}
        transition="pop"
        enterDelay={300}
      >
        {(styles) => (
          <Flex gap="xs" align="center" direction="column" c="dimmed" mt="xl" mb="xl" style={styles}>
            <IconPlaylist size={64} stroke={1.5} />
            <Text fz="sm">请选择一个收藏品来查看要求曲目</Text>
          </Flex>
        )}
      </Transition>
      <Transition
        mounted={Boolean(collectionId && collection && !collection.required)}
        transition="pop"
        enterDelay={300}
      >
        {(styles) => (
          <Flex gap="xs" align="center" direction="column" c="dimmed" mt="xl" mb="xl" style={styles}>
            <IconPlaylistOff size={64} stroke={1.5} />
            <Text fz="sm">该收藏品没有要求曲目</Text>
          </Flex>
        )}
      </Transition>
    </div>
  )
}

export default function Collections() {
  return (
    <Page
      meta={{
        title: "收藏品查询",
        description: "查询「舞萌 DX」收藏品与你的收藏品获取进度",
      }}
      children={<CollectionsContent />}
    />
  )
}