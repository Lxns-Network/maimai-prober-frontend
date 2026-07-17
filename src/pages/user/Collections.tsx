import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { getCollectionById, getPlayerCollectionById } from "@/utils/api/player.ts";
import { Text, Space, Checkbox, Flex, Group, Select } from "@mantine/core";
import { useToggle } from "@mantine/hooks";
import { RequiredSong } from "@/components/Collections/RequiredSong";
import { CollectionCombobox } from "@/components/Collections/CollectionCombobox.tsx";
import { IconPlaylist, IconPlaylistOff } from "@tabler/icons-react";
import { openRetryModal } from "@/utils/modal.tsx";
import { LoginAlert } from "@/components/LoginAlert";
import { Page } from "@/components/Page/Page.tsx";
import { useCollectionList } from "@/hooks/queries/useCollectionList.ts";
import { CollectionProps, CollectionRequiredSongProps } from "@/types/player";
import useGame from "@/hooks/useGame.ts";
import { Game } from "@/types/game";
import { CollectionCard } from "@/components/Collections/CollectionCard.tsx";
import { usePageContext } from "vike-react/usePageContext";
import { AnimatePresence, motion } from "motion/react";
import { match } from "ts-pattern";

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

const getCollectionSelectionKey = (
  game: Game,
  collectionType: string | null,
  collectionId: number | null,
) => `${game}:${collectionType ?? ""}:${collectionId ?? ""}`;

type Action =
  | {
      type: "SET_FROM_URL";
      payload: { collectionType: string | null; collectionId: number | null };
    }
  | {
      type: "SET_FROM_USER";
      payload: { collectionType: string | null; collectionId: number | null };
    }
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
        collectionId: null,
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
  const pageContext = usePageContext();
  const searchParams = new URLSearchParams(pageContext.urlParsed.search);
  const [game] = useGame();
  const previousGame = useRef(game);
  const [state, dispatch] = useReducer(reducer, {
    collectionType: (() => {
      const type = searchParams.get("collection_type");
      if (type && collectionTypeData[game].some((item) => item.value === type)) return type;
      return game === "maimai" ? "plate" : "trophy";
    })(),
    collectionId: (() => {
      const id = searchParams.get("collection_id");
      return id && !isNaN(parseInt(id)) ? parseInt(id) : null;
    })(),
  });

  const { collectionType, collectionId } = state;
  const { collections, isLoading: isCollectionListLoading } = useCollectionList(
    game,
    collectionType,
  );
  const [displayCollectionType, setDisplayCollectionType] = useState<string | null>(null);
  const [filteredCollections, setFilteredCollections] = useState<CollectionProps[]>([]);
  const [collection, setCollection] = useState<CollectionProps | null>(null);
  const [records, setRecords] = useState<CollectionRequiredSongProps[]>([]);
  const [onlyRequired, toggleOnlyRequired] = useToggle();
  const [isCollectionLoading, setIsCollectionLoading] = useState(false);
  const isLoggedOut = !localStorage.getItem("token");
  const collectionRequestId = useRef(0);
  const loadedCollectionKey = useRef<string | null>(null);
  const currentSelectionKey = getCollectionSelectionKey(game, collectionType, collectionId);
  const currentSelectionKeyRef = useRef(currentSelectionKey);
  const loadCollectionRef = useRef<(id: number) => Promise<void>>(async () => undefined);
  currentSelectionKeyRef.current = currentSelectionKey;

  const commitCollection = useCallback(
    (next: CollectionProps | null, selectionKey: string | null) => {
      loadedCollectionKey.current = next ? selectionKey : null;
      setCollection(next);
    },
    [],
  );

  const loadCollection = useCallback(
    async (id: number) => {
      if (!collectionType) return;

      const requestKey = getCollectionSelectionKey(game, collectionType, id);
      if (currentSelectionKeyRef.current !== requestKey) return;

      const requestId = ++collectionRequestId.current;
      const isCurrentRequest = () =>
        requestId === collectionRequestId.current && currentSelectionKeyRef.current === requestKey;
      setIsCollectionLoading(true);
      try {
        if (isLoggedOut) {
          const res = await getCollectionById(game, collectionType, id);
          if (!res.ok) throw new Error(`请求失败：${res.status}`);
          const data = await res.json();
          if (isCurrentRequest()) commitCollection(data, requestKey);
          return;
        }

        const res = await getPlayerCollectionById(game, collectionType, id);
        const data = await res.json();
        if (!isCurrentRequest()) return;

        if (data.success) {
          commitCollection(data.data, requestKey);
          return;
        }

        if (data.code === 404) {
          const publicRes = await getCollectionById(game, collectionType, id);
          if (!publicRes.ok) throw new Error(`请求失败：${publicRes.status}`);
          const publicData = await publicRes.json();
          if (isCurrentRequest()) commitCollection(publicData, requestKey);
          return;
        }

        commitCollection(collections.find((item) => item.id === id) || null, requestKey);
        throw new Error(data.message);
      } catch (error) {
        if (!isCurrentRequest()) return;
        openRetryModal("收藏品获取失败", `${error}`, () => {
          if (currentSelectionKeyRef.current === requestKey) {
            void loadCollectionRef.current(id);
          }
        });
      } finally {
        if (isCurrentRequest()) setIsCollectionLoading(false);
      }
    },
    [collectionType, collections, commitCollection, game, isLoggedOut],
  );
  loadCollectionRef.current = loadCollection;

  useEffect(() => {
    if (previousGame.current !== game) {
      collectionRequestId.current += 1;
      setFilteredCollections([]);
      commitCollection(null, null);
      setIsCollectionLoading(false);
      window.history.replaceState(window.history.state, "", window.location.pathname);
      dispatch({ type: "RESET_COLLECTION_ID" });
      dispatch({
        type: "SET_FROM_SELECT",
        payload: { collectionType: game === "maimai" ? "plate" : "trophy" },
      });
    }
    previousGame.current = game;
  }, [commitCollection, game]);

  useEffect(() => {
    if (collectionId === null) {
      collectionRequestId.current += 1;
      commitCollection(null, null);
      setRecords([]);
      setIsCollectionLoading(false);
      return;
    }

    const selectionKey = getCollectionSelectionKey(game, collectionType, collectionId);
    commitCollection(
      collections.find((collection) => collection.id === collectionId) || null,
      selectionKey,
    );
    setRecords([]);
    void loadCollection(collectionId);
  }, [collectionId, collectionType, collections, commitCollection, game, loadCollection]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDisplayCollectionType(collectionType);
    }, 300);

    return () => clearTimeout(timer);
  }, [collectionType]);

  useEffect(() => {
    if (
      !collection ||
      collection.id !== collectionId ||
      loadedCollectionKey.current !== currentSelectionKey
    ) {
      setRecords([]);
      return;
    }

    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}?game=${game}&collection_type=${collectionType || ""}&collection_id=${collection.id.toString()}`,
    );

    if (!collection.required) {
      setRecords([]);
      return;
    }

    const mergedRequiredSongs = collection.required.flatMap((required) => required.songs || []);

    // 去重并合并 completed_difficulties
    const songMap = new Map();
    mergedRequiredSongs.forEach((song) => {
      const key = `${song.id}-${song.type}`;
      if (songMap.has(key)) {
        const existing = songMap.get(key);
        existing.completed_difficulties = [
          ...new Set([
            ...(existing.completed_difficulties || []),
            ...(song.completed_difficulties || []),
          ]),
        ];
      } else {
        songMap.set(key, { ...song });
      }
    });

    const convertedRecords = Array.from(songMap.values()).map((song) => {
      if (!song.completed_difficulties) return song;

      const record = { ...song };
      song.completed_difficulties.forEach((difficulty: number) => {
        record[`difficulty_${difficulty}`] = true;
      });
      return record;
    });

    setRecords(convertedRecords);
  }, [collection, collectionId, collectionType, currentSelectionKey, game]);

  useEffect(() => {
    setFilteredCollections(
      collections.filter((collection) => {
        if (onlyRequired) return collection.required && collection.required.length > 0;
        return true;
      }),
    );
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
            window.history.replaceState(
              window.history.state,
              "",
              `${window.location.pathname}?game=${game}&collection_type=${value || ""}`,
            );
            setFilteredCollections([]);
          }}
          allowDeselect={false}
          w="30%"
          maw={150}
          radius="md"
          comboboxProps={{
            transitionProps: { transition: "fade", duration: 100, timingFunction: "ease" },
          }}
        />
        <CollectionCombobox
          collections={filteredCollections}
          loading={isCollectionListLoading}
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
      <AnimatePresence mode="wait" initial={false}>
        {match(Boolean(collectionId !== null && collection))
          .with(true, () => (
            <motion.div
              key="content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <CollectionCard collection={collection} collectionType={displayCollectionType} />
              <Space h="md" />
              <LoginAlert
                content="你需要登录查分器账号才能查看你的收藏品获取进度。"
                mb="md"
                radius="md"
              />
              {collection?.required ? (
                <RequiredSong
                  collection={collection}
                  records={records}
                  loading={isCollectionLoading}
                />
              ) : (
                <Flex gap="xs" align="center" direction="column" c="dimmed" mt="xl" mb="xl">
                  <IconPlaylistOff size={64} stroke={1.5} />
                  <Text fz="sm">该收藏品没有要求曲目</Text>
                </Flex>
              )}
            </motion.div>
          ))
          .with(false, () => (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <Flex gap="xs" align="center" direction="column" c="dimmed" mt="xl" mb="xl">
                <IconPlaylist size={64} stroke={1.5} />
                <Text fz="sm">请选择一个收藏品来查看要求曲目</Text>
              </Flex>
            </motion.div>
          ))
          .exhaustive()}
      </AnimatePresence>
    </div>
  );
};

export default function Collections() {
  return (
    <Page
      meta={{
        title: "收藏品查询",
        description: "查询「舞萌 DX」与「中二节奏」的收藏品详情",
      }}
      children={<CollectionsContent />}
    />
  );
}
