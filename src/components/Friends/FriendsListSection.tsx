import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionIcon,
  Button,
  CloseButton,
  Flex,
  Group,
  Menu,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import {
  IconArrowsSort,
  IconCheck,
  IconSearch,
  IconSortAscending,
  IconSortDescending,
  IconStar,
  IconStarFilled,
  IconUsersGroup,
} from "@tabler/icons-react";
import { useMediaQuery, useReducedMotion } from "@mantine/hooks";
import { EmptyState } from "@/components/EmptyState";
import { ResponsivePagination } from "@/components/ResponsivePagination";
import { useFriends } from "@/hooks/queries/useFriends";
import useGame from "@/hooks/useGame";
import { Game } from "@/types/game";
import { AddFriendButton } from "./AddFriendButton";
import { FriendCard } from "./FriendCard";
import { LoadingBlock } from "./LoadingBlock";

const PAGE_SIZE = 20;

type SortOption =
  | "default"
  | "rating_desc"
  | "rating_asc"
  | "recent_sync"
  | "friends_since_desc"
  | "username_asc";

const getSortItems = (game: Game): { key: SortOption; name: string; icon: ReactNode }[] => [
  { key: "default", name: "默认排序", icon: <IconArrowsSort size={16} /> },
  {
    key: "rating_desc",
    name: game === "maimai" ? "DX 评分最高" : "Rating 最高",
    icon: <IconSortDescending size={16} />,
  },
  {
    key: "rating_asc",
    name: game === "maimai" ? "DX 评分最低" : "Rating 最低",
    icon: <IconSortAscending size={16} />,
  },
  { key: "recent_sync", name: "最近同步时间", icon: <IconArrowsSort size={16} /> },
  { key: "friends_since_desc", name: "成为好友时间", icon: <IconArrowsSort size={16} /> },
  { key: "username_asc", name: "名称排序 (A-Z)", icon: <IconSortAscending size={16} /> },
];

export const FriendsListSection = () => {
  const [game] = useGame();
  const { friends, isLoading } = useFriends();

  const [search, setSearch] = useState("");
  const [onlyFavorite, setOnlyFavorite] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("default");
  const [page, setPage] = useState(1);
  const topRef = useRef<HTMLDivElement>(null);
  const previousGameRef = useRef(game);
  const small = useMediaQuery("(max-width: 30rem)");
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (previousGameRef.current === game) return;
    previousGameRef.current = game;
    setPage(1);
  }, [game]);

  const filteredFriends = useMemo(() => {
    const term = search.trim().toLowerCase();

    return friends
      .filter((friend) => {
        if (onlyFavorite && !friend.is_favorite) return false;
        if (!term) return true;

        const profile = friend.games[game].profile;
        return (
          friend.username.toLowerCase().includes(term) ||
          friend.remark?.toLowerCase().includes(term) ||
          profile?.name?.toLowerCase().includes(term) ||
          profile?.trophy?.name?.toLowerCase().includes(term)
        );
      })
      .sort((a, b) => {
        if (a.is_favorite !== b.is_favorite) {
          return a.is_favorite ? -1 : 1;
        }

        const aProfile = a.games[game].profile;
        const bProfile = b.games[game].profile;

        switch (sortBy) {
          case "rating_desc":
            return (bProfile?.rating ?? -1) - (aProfile?.rating ?? -1);
          case "rating_asc":
            return (aProfile?.rating ?? Infinity) - (bProfile?.rating ?? Infinity);
          case "recent_sync": {
            const aTime = aProfile?.upload_time ? new Date(aProfile.upload_time).getTime() : 0;
            const bTime = bProfile?.upload_time ? new Date(bProfile.upload_time).getTime() : 0;
            return bTime - aTime;
          }
          case "username_asc":
            return (a.remark || a.username).localeCompare(b.remark || b.username, "zh-CN");
          default:
            return new Date(b.friends_since).getTime() - new Date(a.friends_since).getTime();
        }
      });
  }, [friends, game, search, onlyFavorite, sortBy]);

  const totalPages = Math.ceil(filteredFriends.length / PAGE_SIZE);
  const currentPage = Math.min(page, Math.max(1, totalPages));
  const displayFriends = filteredFriends.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handlePageChange = (value: number) => {
    setPage(value);
    topRef.current?.scrollIntoView({
      behavior: reduceMotion ? "instant" : "smooth",
      block: "start",
    });
  };

  const sortItems = getSortItems(game);
  const activeSortName = sortItems.find((item) => item.key === sortBy)?.name;

  return (
    <Stack gap="md" ref={topRef} style={{ scrollMarginTop: 16 }}>
      <Flex gap="xs" align="center" wrap="wrap">
        <TextInput
          placeholder={small ? "搜索好友" : "搜索用户名、备注、游戏昵称或称号"}
          leftSection={<IconSearch size={16} />}
          rightSection={
            search ? (
              <CloseButton aria-label="清空搜索" onClick={() => handleSearchChange("")} size="sm" />
            ) : null
          }
          value={search}
          onChange={(e) => handleSearchChange(e.currentTarget.value)}
          style={{ flex: 1, minWidth: 120 }}
        />

        <Tooltip label={onlyFavorite ? "显示所有好友" : "仅显示特别关注"}>
          <ActionIcon
            variant="default"
            color="gray"
            size="input-sm"
            onClick={() => {
              setOnlyFavorite(!onlyFavorite);
              setPage(1);
            }}
            aria-label="仅显示特别关注"
          >
            {onlyFavorite ? (
              <IconStarFilled size={18} style={{ color: "var(--mantine-color-yellow-6)" }} />
            ) : (
              <IconStar size={18} />
            )}
          </ActionIcon>
        </Tooltip>

        <Menu shadow="md" position="bottom-end">
          <Menu.Target>
            {small ? (
              <ActionIcon variant="default" size="input-sm" aria-label="排序方式">
                <IconArrowsSort size={18} />
              </ActionIcon>
            ) : (
              <Button variant="default" leftSection={<IconArrowsSort size={16} />}>
                {activeSortName}
              </Button>
            )}
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>排序方式</Menu.Label>
            {sortItems.map((item) => (
              <Menu.Item
                key={item.key}
                leftSection={item.icon}
                rightSection={sortBy === item.key ? <IconCheck size={14} /> : null}
                onClick={() => {
                  setSortBy(item.key);
                  setPage(1);
                }}
              >
                {item.name}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>

        <AddFriendButton />
      </Flex>

      {(search || onlyFavorite) && friends.length > 0 && (
        <Text size="xs" c="dimmed" px={4}>
          筛选出 {filteredFriends.length} / {friends.length} 位好友
        </Text>
      )}

      {isLoading && friends.length === 0 ? (
        <LoadingBlock />
      ) : filteredFriends.length > 0 ? (
        <>
          <ResponsivePagination
            total={totalPages}
            value={currentPage}
            onChange={handlePageChange}
            hideWithOnePage
          />
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            {displayFriends.map((friend) => (
              <FriendCard key={friend.user_id} friend={friend} />
            ))}
          </SimpleGrid>
          <ResponsivePagination
            total={totalPages}
            value={currentPage}
            onChange={handlePageChange}
            hideWithOnePage
          />
        </>
      ) : (
        <EmptyState
          icon={<IconUsersGroup size={64} stroke={1.5} />}
          title={search || onlyFavorite ? "没有找到匹配的好友" : "暂无好友"}
          description={
            search || onlyFavorite ? "请尝试更改搜索词或重置筛选条件" : "添加好友后可在此查看"
          }
        >
          {search || onlyFavorite ? (
            <Group mt="md">
              <Button
                variant="light"
                size="xs"
                onClick={() => {
                  setSearch("");
                  setOnlyFavorite(false);
                  setPage(1);
                }}
              >
                重置筛选条件
              </Button>
            </Group>
          ) : null}
        </EmptyState>
      )}
    </Stack>
  );
};
