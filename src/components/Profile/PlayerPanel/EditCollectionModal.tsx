import {
  Alert, Anchor, Box, Button, Center, Flex, Group, HoverCard, Image, Loader, Mark, Modal, Radio, ScrollArea, SimpleGrid,
  Space, Stack, Text, TextInput, ThemeIcon, Tooltip
} from "@mantine/core";
import { usePlayerCollections } from "@/hooks/swr/usePlayerCollections.ts";
import { useEffect, useState } from "react";
import classes from "./EditCollectionModal.module.css";
import LazyLoad from "react-lazyload";
import { forceCheck } from 'react-lazyload';
import { IconDatabaseOff, IconHeartFilled, IconHelp, IconSearch } from "@tabler/icons-react";
import Icon from "@mdi/react";
import { mdiWebOff } from "@mdi/js";
import { useThrottledValue } from "@mantine/hooks";
import { Marquee } from "@/components/Marquee.tsx";
import { Game } from "@/types/game";
import { useNavigate } from "react-router-dom";

const collectionMetadata = {
  maimai: {
    trophies: {
      title: "称号",
      key: "trophy",
      path: "",
    },
    icons: {
      title: "头像",
      key: "icon",
      path: "icon",
    },
    plates: {
      title: "姓名框",
      key: "name_plate",
      path: "plate",
    },
    frames: {
      title: "背景",
      key: "frame",
      path: "frame",
    },
  },
  chunithm: {
    trophies: {
      title: "称号",
      key: "trophy",
      path: "",
    },
    characters: {
      title: "角色",
      key: "character",
      path: "character",
    },
    plates: {
      title: "名牌版",
      key: "name_plate",
      path: "plate",
    },
    icons: {
      title: "地图头像",
      key: "map_icon",
      path: "icon",
    },
  },
}

export type Collection = "trophies" | "icons" | "plates" | "frames" | "characters";

interface EditCollectionModalContentProps {
  game: Game;
  type: Collection;
  defaultValue: number;
  onCancel: () => void;
  onSubmit: (key: string, id: number) => void;
}

const EditCollectionModalContent = (
  { game, type, defaultValue, onCancel, onSubmit }: EditCollectionModalContentProps
) => {
  const { collections, isLoading, error } = usePlayerCollections({ game, type });
  const [collectionId, setCollectionId] = useState(defaultValue);
  const [searchedCollections, setSearchedCollections] = useState(collections);
  const [search, setSearch] = useState("");
  const throttledSearch = useThrottledValue(search, 1000);

  const pageSize = 20;
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [scrollPosition, onScrollPositionChange] = useState({ x: 0, y: 0 });

  const handleLoadMore = () => {
    setVisibleCount((prev) => prev + pageSize);
  };

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [throttledSearch]);

  useEffect(() => {
    const lowerSearch = search.toLowerCase();
    const filtered = search.trim() === ""
      ? collections
      : collections.filter((collection) =>
        collection.name.toLowerCase().includes(lowerSearch)
      );
    const sorted = filtered.sort((a, b) => {
      if (a.id === defaultValue) return -1;
      if (b.id === defaultValue) return 1;
      return a.id - b.id;
    });

    setSearchedCollections(sorted.slice(0, visibleCount));
  }, [throttledSearch, collections, visibleCount]);

  useEffect(() => {
    forceCheck();
  }, [scrollPosition]);

  if (isLoading) {
    return (
      <Center>
        <Loader />
      </Center>
    );
  }

  const isAvatar = type === "icons" || type === "characters";
  const metadata = collectionMetadata[game][type as keyof typeof collectionMetadata[Game]];

  const cards = searchedCollections.map((collection) => (
    <Radio.Card className={classes.root} radius="md" value={collection.id.toString()} key={`${type}:${collection.id}`}>
      <Group wrap="nowrap" align="flex-start">
        <Radio.Indicator />
        <div style={{ flex: 1 }}>
          <Flex align="center" columnGap={8}>
            <Box style={{ flex: 1 }}>
              <Marquee>
                <Text className={classes.label}>{collection.name}</Text>
              </Marquee>
            </Box>
            {collection.is_favorite && (
              <Center h={0}>
                <Tooltip label="已收藏" withinPortal>
                  <ThemeIcon variant="light" color="red" size="sm" radius="xl">
                    <IconHeartFilled size={18} />
                  </ThemeIcon>
                </Tooltip>
              </Center>
            )}
          </Flex>
          {!(type === "frames" && collection.id === 1) && (
            <Box mt="xs">
              <LazyLoad overflow placeholder={<Loader mt="xs" />}>
                {isAvatar ? (
                  <Image src={`https://assets2.lxns.net/${game}/${metadata.path}/${collection.id}.png`} h={54} w={54} />
                ) : (
                  <Image src={`https://assets2.lxns.net/${game}/${metadata.path}/${collection.id}.png`} w="100%" />
                )}
              </LazyLoad>
            </Box>
          )}
        </div>
      </Group>
    </Radio.Card>
  ));

  return (
    <Flex direction="column" style={{ maxHeight: "calc(90dvh - 76px)" }}>
      <TextInput
        placeholder={`搜索拥有的${metadata.title}`}
        radius="md"
        mb="md"
        leftSection={<IconSearch size={18} />}
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        style={{ flex: '0 0 auto' }}
      />
      {error ? (
        <Alert radius="md" icon={<Icon path={mdiWebOff} />} title={`没有获取到玩家${metadata.title}数据`} color="red" mb="md">
          <Text size="sm">
            {error instanceof Error ? error.message : "可能是网络连接已断开，请检查你的网络连接是否正常。"}
          </Text>
        </Alert>
      ) : (
        <ScrollArea.Autosize
          onScrollPositionChange={onScrollPositionChange}
          style={{ flex: 1, minHeight: 0 }}
        >
          <Radio.Group
            value={collectionId.toString()}
            onChange={(value) => setCollectionId(parseInt(value))}
          >
              {cards.length === 0 ? (
                <Flex gap="xs" align="center" justify="center" direction="column" c="dimmed">
                  <IconDatabaseOff size={64} stroke={1.5} />
                  <Text fz="sm">没有搜索到{metadata.title}，请输入其它关键词</Text>
                </Flex>
              ) : (
                <Stack gap="xs">
                  <SimpleGrid cols={isAvatar ? 2 : 1}>
                    {cards}
                  </SimpleGrid>
                  {searchedCollections.length < collections.filter(c =>
                    c.name.toLowerCase().includes(search.toLowerCase())
                  ).length && (
                    <Button variant="light" onClick={handleLoadMore}>加载更多</Button>
                  )}
                </Stack>
              )}
          </Radio.Group>
        </ScrollArea.Autosize>
      )}
      <Box style={{ flex: '0 0 auto' }}>
        {game === "maimai" ? (
          <Text size="xs" mt="sm" mb="sm" c="gray">※ 编辑收藏的{metadata.title}请前往 NET 操作，重新同步后生效。</Text>
        ) : (
          <Space h="md" />
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onCancel}>取消</Button>
          <Button type="submit" onClick={() => onSubmit(metadata.key, collectionId)} disabled={error}>保存</Button>
        </Group>
      </Box>
    </Flex>
  )
}

interface EditCollectionModalProps {
  game: Game;
  type: Collection;
  defaultValue: number;
  opened: boolean;
  onCancel: () => void;
  onSubmit: (key: string, id: number) => void;
}

export const EditCollectionModal = (
  { game, type, defaultValue, opened, onCancel, onSubmit }: EditCollectionModalProps
) => {
  const navigate = useNavigate();

  const metadata = collectionMetadata[game][type as keyof typeof collectionMetadata[Game]];
  const title = metadata?.title || "收藏品";

  return (
    <Modal.Root opened={opened} onClose={onCancel} centered>
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>
            <Group gap="xs">
              编辑{title}
              <HoverCard width={280} shadow="md">
                <HoverCard.Target>
                  <ThemeIcon variant="subtle" color="gray" size="sm">
                    <IconHelp />
                  </ThemeIcon>
                </HoverCard.Target>
                <HoverCard.Dropdown>
                  <Text size="sm" mb="xs">
                    这里仅会显示同步后<Mark>拥有的{title}</Mark>。如果没有显示，请检查<Anchor onClick={() => navigate("/user/settings")}>{title}爬取设置</Anchor>是否打开。
                  </Text>
                  <Text size="sm">
                    您可以根据需要修改装备的{title}，若{title}爬取设置为开，下次同步时装备的{title}将会被覆盖。
                  </Text>
                </HoverCard.Dropdown>
              </HoverCard>
            </Group>
          </Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body>
          <EditCollectionModalContent
            game={game}
            type={type}
            defaultValue={defaultValue}
            onCancel={onCancel}
            onSubmit={onSubmit}
          />
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}