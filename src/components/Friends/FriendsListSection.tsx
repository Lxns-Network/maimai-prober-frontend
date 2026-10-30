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
  IconClockPlus,
  IconRefresh,
  IconSearch,
  IconShield,
  IconSortAZ,
  IconSortAscending,
  IconSortDescending,
  IconStar,
  IconStarFilled,
  IconUsersGroup,
} from "@tabler/icons-react";
import { useMediaQuery, useReducedMotion } from "@mantine/hooks";
import { EmptyState } from "@/components/EmptyState";
import { QueryErrorState } from "@/components/QueryErrorState";
import { ResponsivePagination } from "@/components/ResponsivePagination";
import { useFriends } from "@/hooks/queries/useFriends";
import { usePlayer } from "@/hooks/queries/usePlayer";
import { useUser } from "@/hooks/queries/useUser";
import useFriendStore from "@/hooks/useFriendStore";
import useGame from "@/hooks/useGame";
import { FriendItem } from "@/types/friend";
import { Game } from "@/types/game";
import { getFriendLoadErrorMessage, MAX_FRIENDS } from "@/utils/api/friend";
import { AddFriendButton } from "./AddFriendButton";
import { FriendCard, FriendCardSkeleton, SelfRankCard } from "./FriendCard";

const PAGE_SIZE = 20;

type SortOption = "default" | "rating_desc" | "rating_asc" | "recent_sync" | "username_asc";

const SORT_OPTIONS: SortOption[] = [
  "default",
  "rating_desc",
  "rating_asc",
  "recent_sync",
  "username_asc",
];

const getSortItems = (game: Game): { key: SortOption; name: string; icon: ReactNode }[] => [
  { key: "default", name: "最近添加", icon: <IconClockPlus size={16} /> },
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
  { key: "recent_sync", name: "最近同步", icon: <IconRefresh size={16} /> },
  { key: "username_asc", name: "名称（A-Z）", icon: <IconSortAZ size={16} /> },
];

/** 写进 URL 的列表状态，从资料页返回或刷新后据此恢复。 */
const LIST_PARAMS = ["search", "favorite", "sort", "page"];

interface ListState {
  search: string;
  onlyFavorite: boolean;
  sortBy: SortOption;
  page: number;
}

const readListState = (search: string): ListState => {
  const params = new URLSearchParams(search);
  const sort = params.get("sort") as SortOption | null;
  const page = Number(params.get("page"));
  return {
    search: params.get("search") ?? "",
    onlyFavorite: params.get("favorite") === "1",
    sortBy: sort && SORT_OPTIONS.includes(sort) ? sort : "default",
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
};

const ratingOf = (friend: FriendItem, game: Game) => {
  const slot = friend.games[game];
  return slot.state === "visible" ? slot.profile?.rating : undefined;
};

type ListEntry =
  | { kind: "friend"; friend: FriendItem; rank?: number }
  | { kind: "self"; rank: number };

export const FriendsListSection = () => {
  const [game] = useGame();
  const { friends, isLoading, error, refetch } = useFriends();
  const { player } = usePlayer(game);
  const { user } = useUser();
  const setListSearch = useFriendStore((state) => state.setListSearch);
  const openBlocks = useFriendStore((state) => state.openBlocks);

  const [initialState] = useState(() => readListState(window.location.search));
  const [search, setSearch] = useState(initialState.search);
  const [onlyFavorite, setOnlyFavorite] = useState(initialState.onlyFavorite);
  const [sortBy, setSortBy] = useState<SortOption>(initialState.sortBy);
  const [page, setPage] = useState(initialState.page);
  const topRef = useRef<HTMLDivElement>(null);
  const small = useMediaQuery("(max-width: 30rem)");
  const reduceMotion = useReducedMotion();

  const term = search.trim().toLowerCase();
  const isRatingSort = sortBy === "rating_desc" || sortBy === "rating_asc";

  /** 全部好友加上本人的评分名次（并列同名次），不受搜索与筛选影响。 */
  const ranking = useMemo(() => {
    const rated: { id: number | "self"; rating: number }[] = friends.flatMap((friend) => {
      const rating = ratingOf(friend, game);
      return rating === undefined ? [] : [{ id: friend.user_id, rating }];
    });
    if (player) rated.push({ id: "self", rating: player.rating });
    rated.sort((a, b) => b.rating - a.rating);

    const ranks = new Map<number | "self", number>();
    rated.forEach((item, index) => {
      const previous = rated[index - 1];
      ranks.set(
        item.id,
        previous && previous.rating === item.rating ? ranks.get(previous.id)! : index + 1,
      );
    });
    return { ranks, total: rated.length };
  }, [friends, game, player]);

  const filteredFriends = useMemo(
    () =>
      friends
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
          // 按评分排序是在排名，特别关注置顶会打乱名次。
          if (!isRatingSort && a.is_favorite !== b.is_favorite) {
            return a.is_favorite ? -1 : 1;
          }

          const aProfile = a.games[game].profile;
          const bProfile = b.games[game].profile;

          switch (sortBy) {
            case "rating_desc":
              return (ratingOf(b, game) ?? -1) - (ratingOf(a, game) ?? -1);
            case "rating_asc":
              return (ratingOf(a, game) ?? Infinity) - (ratingOf(b, game) ?? Infinity);
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
        }),
    [friends, game, term, onlyFavorite, sortBy, isRatingSort],
  );

  const selfRank = ranking.ranks.get("self");
  const entries = useMemo(() => {
    const list: ListEntry[] = filteredFriends.map((friend) => ({
      kind: "friend",
      friend,
      rank: isRatingSort ? ranking.ranks.get(friend.user_id) : undefined,
    }));
    if (isRatingSort && player && selfRank !== undefined && !term) {
      const index = list.findIndex((entry) => {
        if (entry.kind !== "friend") return false;
        return sortBy === "rating_desc"
          ? (ratingOf(entry.friend, game) ?? -1) < player.rating
          : (ratingOf(entry.friend, game) ?? Infinity) > player.rating;
      });
      list.splice(index === -1 ? list.length : index, 0, { kind: "self", rank: selfRank });
    }
    return list;
  }, [filteredFriends, isRatingSort, ranking, player, selfRank, term, sortBy, game]);

  const totalPages = Math.ceil(entries.length / PAGE_SIZE);
  const currentPage = Math.min(page, Math.max(1, totalPages));
  const displayEntries = entries.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  // 好友列表加载完成前无法校正页码，先原样保留 URL 中的页码。
  const pageForUrl = friends.length > 0 ? currentPage : page;

  useEffect(() => {
    const url = new URL(window.location.href);
    LIST_PARAMS.forEach((param) => url.searchParams.delete(param));
    if (search.trim()) url.searchParams.set("search", search.trim());
    if (onlyFavorite) url.searchParams.set("favorite", "1");
    if (sortBy !== "default") url.searchParams.set("sort", sortBy);
    if (pageForUrl > 1) url.searchParams.set("page", String(pageForUrl));

    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    if (nextUrl !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(window.history.state, "", nextUrl);
    }
    const back = new URLSearchParams(url.search);
    back.set("tab", "friends");
    setListSearch(`?${back.toString()}`);
  }, [search, onlyFavorite, sortBy, pageForUrl, setListSearch]);

  const filtering = !!term || onlyFavorite;

  const resetFilters = () => {
    setSearch("");
    setOnlyFavorite(false);
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

  const summary = filtering
    ? `筛选出 ${filteredFriends.length} / ${friends.length} 位好友`
    : friends.length >= MAX_FRIENDS
      ? `好友数量已达上限（${MAX_FRIENDS} 人）`
      : `共 ${friends.length} 位好友，上限 ${MAX_FRIENDS} 人`;

  const renderContent = () => {
    if (isLoading && friends.length === 0) {
      return (
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          {Array.from({ length: 4 }, (_, index) => (
            <FriendCardSkeleton key={index} />
          ))}
        </SimpleGrid>
      );
    }

    if (error && friends.length === 0) {
      return (
        <QueryErrorState
          title="好友列表加载失败"
          description={getFriendLoadErrorMessage(error)}
          onRetry={() => void refetch()}
        />
      );
    }

    if (entries.length === 0) {
      return (
        <EmptyState
          icon={<IconUsersGroup size={64} stroke={1.5} />}
          title={filtering ? "没有找到匹配的好友" : "暂无好友"}
          description={
            filtering
              ? "请尝试更改搜索词或重置筛选条件"
              : "用查分器用户名添加好友后，就能查看对方的名片与成绩"
          }
        >
          {filtering ? (
            <Group mt="md">
              <Button variant="light" size="xs" onClick={resetFilters}>
                重置筛选条件
              </Button>
            </Group>
          ) : null}
        </EmptyState>
      );
    }

    return (
      <>
        <ResponsivePagination
          total={totalPages}
          value={currentPage}
          onChange={handlePageChange}
          hideWithOnePage
        />
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          {displayEntries.map((entry) =>
            entry.kind === "self" ? (
              player && (
                <SelfRankCard
                  key="self"
                  game={game}
                  player={player}
                  username={user?.name}
                  rank={entry.rank}
                />
              )
            ) : (
              <FriendCard key={entry.friend.user_id} friend={entry.friend} rank={entry.rank} />
            ),
          )}
        </SimpleGrid>
        <ResponsivePagination
          total={totalPages}
          value={currentPage}
          onChange={handlePageChange}
          hideWithOnePage
        />
      </>
    );
  };

  return (
    <Stack gap="md" ref={topRef} style={{ scrollMarginTop: 16 }}>
      <Flex gap="xs" align="center" wrap="wrap">
        <TextInput
          placeholder={small ? "搜索好友" : "搜索用户名、备注、游戏昵称或称号"}
          leftSection={<IconSearch size={16} />}
          rightSection={
            search ? (
              <CloseButton
                aria-label="清空搜索"
                onClick={() => {
                  setSearch("");
                  setPage(1);
                }}
                size="sm"
              />
            ) : null
          }
          value={search}
          onChange={(e) => {
            setSearch(e.currentTarget.value);
            setPage(1);
          }}
          flex={1}
          miw={120}
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
            aria-pressed={onlyFavorite}
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

      <Group gap="xs" px={4} justify="space-between">
        {friends.length > 0 && (
          <Text size="xs" c={!filtering && friends.length >= MAX_FRIENDS ? "orange" : "dimmed"}>
            {summary}
          </Text>
        )}
        <Group gap="xs" ml="auto">
          {isRatingSort && selfRank !== undefined && (
            <Text size="xs" c="dimmed">
              你在 {ranking.total} 人中排第 {selfRank}
            </Text>
          )}
          <Button
            variant="subtle"
            color="gray"
            size="compact-xs"
            leftSection={<IconShield size={14} />}
            onClick={openBlocks}
          >
            黑名单
          </Button>
        </Group>
      </Group>

      {renderContent()}
    </Stack>
  );
};
