import { useEffect, useReducer, useState } from "react";
import { getCollectionById, getPlayerCollectionById } from "@/utils/api/player.ts";
import { Text, Space, Checkbox, Flex, Transition, Group, Select } from "@mantine/core";
import {usePrevious, useToggle} from "@mantine/hooks";
import { RequiredSong } from "@/components/Collections/RequiredSong";
import { CollectionCombobox } from "@/components/Collections/CollectionCombobox.tsx";
import { IconPlaylist, IconPlaylistOff } from "@tabler/icons-react";
import { openRetryModal } from "@/utils/modal.tsx";
import { LoginAlert } from "@/components/LoginAlert";
import { Page } from "@/components/Page/Page.tsx";
import { useCollectionList } from "@/hooks/swr/useCollectionList.ts";
import { CollectionProps } from "@/types/player";
import { useSearchParams } from "react-router-dom";
import useGame from "@/hooks/useGame.ts";
import { Game } from "@/types/game";
import { CollectionCard } from "@/components/Collections/CollectionCard.tsx";

const collectionTypeData: Record<Game, { label: string; value: string }[]> = {
  maimai: [
    { label: "姓名框", value: "plate" },
    { label: "称号", value: "trophy" },
    { label: "头像", value: "icon" },
    { label: "背景", value: "frame" },
  ],
  chunithm: [
    { label: "称号", value: "trophy" },
    { label: "角色", value: "character" },
    { label: "名牌版", value: "plate" },
    { label: "地图头像", value: "icon" },
  ],
};

interface State {
  collectionType: string | null;
  collectionId: number | null;
}

type Action =
  | { type: "SET_FROM_URL"; payload: { collectionType: string | null; collectionId: number | null } }
  | { type: "SET_FROM_USER"; payload: { collectionType: string | null; collectionId: number | null } }
  | { type: "SET_FROM_SELECT"; payload: { collectionType: string | null } }
  | { type: "RESET_COLLECTION_ID" };

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "SET_FROM_URL":
      return {
        ...state,
        collectionType: action.payload.collectionType,
        collectionId: action.payload.collectionId,
      };
    case "SET_FROM_USER":
      return {
        ...state,
        collectionType: action.payload.collectionType,
        collectionId: action.payload.collectionId,
      };
    case "SET_FROM_SELECT":
      return {
        ...state,
        collectionType: action.payload.collectionType,
        collectionId: null, // Reset collectionId when collectionType changes from Select
      };
    case "RESET_COLLECTION_ID":
      return {
        ...state,
        collectionId: null,
      };
    default:
      return state;
  }
};

const CollectionsContent = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [game] = useGame();
  const prevGame = usePrevious(game);
  const [state, dispatch] = useReducer(reducer, {
    collectionType: (() => {
      const type = searchParams.get("collection_type");
      if (type && collectionTypeData[game].some(item => item.value === type)) return type;
      return game === "maimai" ? "plate" : "trophy";
    })(),
    collectionId: (() => {
      const id = searchParams.get("collection_id");
      return id && !isNaN(parseInt(id)) ? parseInt(id) : null;
    })(),
  });

  const { collectionType, collectionId } = state;
  const { collections } = useCollectionList(game, collectionType);
  const [displayCollectionType, setDisplayCollectionType] = useState<string | null>(null);
  const [filteredCollections, setFilteredCollections] = useState<CollectionProps[]>([]);
  const [collection, setCollection] = useState<CollectionProps | null>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [onlyRequired, toggleOnlyRequired] = useToggle();
  const isLoggedOut = !localStorage.getItem("token");

  const getCollectionHandler = async (id: number) => {
    if (!collectionType) return;
    try {
      const res = await getCollectionById(game, collectionType, id);
      const data = await res.json();
      setCollection(data);
    } catch (error) {
      openRetryModal("收藏品获取失败", `${error}`, () => getCollectionHandler(id));
    }
  }

  const getPlayerCollectionHandler = async (id: number) => {
    if (!collectionType) return;
    try {
      const res = await getPlayerCollectionById(game, collectionType, id);
      const data = await res.json();
      if (!data.success) {
        // 如果玩家数据不存在，回退到公共 API
        if (data.code === 404) {
          getCollectionHandler(id);
          return;
        }
        setCollection(filteredCollections.find((plate) => plate.id === id) || null);
        throw new Error(data.message);
      }
      setCollection(data.data);
    } catch (error) {
      openRetryModal("收藏品获取失败", `${error}`, () => getPlayerCollectionHandler(id));
    }
  }

  useEffect(() => {
    if (prevGame !== undefined && prevGame !== game) {
      setFilteredCollections([]);
      setSearchParams({}, { replace: true });
      dispatch({ type: "RESET_COLLECTION_ID" });
      dispatch({ type: "SET_FROM_SELECT", payload: { collectionType: game === "maimai" ? "plate" : "trophy" } });
    }
  }, [game]);

  useEffect(() => {
    if (collectionId === null) return;

    // 先设置为基本信息，等待接口返回完整信息
    setCollection(collections.find((collection) => collection.id === collectionId) || null);
    setRecords([]); // 清空记录

    if (!isLoggedOut) {
      getPlayerCollectionHandler(collectionId);
    } else {
      getCollectionHandler(collectionId);
    }
  }, [collectionId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDisplayCollectionType(state.collectionType);
    }, 300);

    return () => clearTimeout(timer);
  }, [collectionType]);

  useEffect(() => {
    if (!collection) {
      setRecords([]);
      return;
    }

    setSearchParams({
      game: game,
      collection_type: collectionType || "",
      collection_id: collection.id.toString(),
    }, { replace: true });

    if (!collection.required) {
      setRecords([]);
      return;
    }

    let mergedRequiredSongs = collection.required.flatMap(required => (required.songs || []));

    // 去重并合并 completed_difficulties
    const songMap = new Map();
    mergedRequiredSongs.forEach(song => {
      const key = `${song.id}-${song.type}`;
      if (songMap.has(key)) {
        const existing = songMap.get(key);
        existing.completed_difficulties = [
          ...new Set([
            ...(existing.completed_difficulties || []),
            ...(song.completed_difficulties || [])
          ])
        ];
      } else {
        songMap.set(key, { ...song });
      }
    });

    const convertedRecords = Array.from(songMap.values()).map(song => {
      if (!song.completed_difficulties) return song;

      const record = { ...song };
      song.completed_difficulties.forEach((difficulty: number) => {
        record[`difficulty_${difficulty}`] = true;
      });
      return record;
    });

    setRecords(convertedRecords);
  }, [collection]);

  useEffect(() => {
    setFilteredCollections(collections.filter((collection) => {
      if (onlyRequired) return collection.required && collection.required.length > 0;
      return true;
    }));
  }, [collections, onlyRequired]);

  return (
    <div>
      <Group gap="xs" mb="xs">
        <Select
          data={collectionTypeData[game]}
          value={collectionType}
          onChange={(value) => {
            dispatch({
              type: "SET_FROM_SELECT",
              payload: { collectionType: value },
            });
            setSearchParams({ collection_type: value || "" }, { replace: true });
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
          value={collectionId ?? undefined}
          onOptionSubmit={(value) => {
            if (value === null) {
              dispatch({ type: "RESET_COLLECTION_ID" });
              return;
            }
            dispatch({ type: "SET_FROM_USER", payload: { collectionType, collectionId: value } });
          }}
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
        mounted={Boolean(collectionId !== null && collection)}
        transition="pop"
        enterDelay={0}
      >
        {(styles) => (
          <CollectionCard collection={collection} collectionType={displayCollectionType} style={styles} />
        )}
      </Transition>
      <Space h="md" />
      <LoginAlert content="你需要登录查分器账号才能查看你的收藏品获取进度。" mb="md" radius="md" />
      <Transition
        mounted={Boolean(collectionId !== null && collection && collection.required)}
        transition="pop"
        enterDelay={0}
      >
        {(styles) => (
          <RequiredSong collection={collection} records={records} style={styles} />
        )}
      </Transition>
      <Transition
        mounted={collectionId === null}
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
        mounted={Boolean(collectionId !== null && collection && !collection.required)}
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
        description: "查询「舞萌 DX」与「中二节奏」的收藏品详情",
      }}
      children={<CollectionsContent />}
    />
  )
}