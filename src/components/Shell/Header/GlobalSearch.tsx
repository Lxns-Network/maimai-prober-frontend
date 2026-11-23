import { useMemo } from "react";
import {
  ActionIcon,
  Avatar,
  Badge,
  Box,
  Center,
  Group,
  Highlight,
  Loader,
  rem,
  Tooltip,
} from "@mantine/core";
import { useOs } from "@mantine/hooks";
import { createSpotlight, Spotlight, useSpotlight } from "@mantine/spotlight";
import { IconFileText, IconHash, IconPhotoOff, IconSearch } from "@tabler/icons-react";
import { ASSET_URL } from "@/main";
import useGame from "@/hooks/useGame.ts";
import useSongListStore from "@/hooks/useSongListStore.ts";
import useAliasListStore from "@/hooks/useAliasListStore.ts";
import { useBackDismiss } from "@/hooks/useBackDismiss.ts";
import { useUser } from "@/hooks/queries/useUser.ts";
import { useFriends } from "@/hooks/queries/useFriends.ts";
import { useCollectionLists } from "@/hooks/queries/useCollectionList.ts";
import { useDocsSearchIndex } from "@/hooks/queries/useDocsSearchIndex.ts";
import { SongOption } from "@/components/SongCombobox.tsx";
import { collectionTypeData } from "@/components/Collections/collectionTypes.ts";
import { getNavItems, helpNavItem } from "@/components/Shell/Navbar/navItems.tsx";
import { getSearchPages, type SearchPage } from "./searchPages.tsx";
import {
  buildSongSearchIndex,
  getSongHighlightTerms,
  searchSongsByRelevance,
} from "@/utils/songSearch.ts";
import { searchByRelevance } from "@/utils/textSearch.ts";
import { friendSearchFields, gameAvatarSrc, profilePath } from "@/utils/profile.ts";

const SONG_LIMIT = 20;
const FRIEND_LIMIT = 10;
const COLLECTION_LIMIT = 20;
const DOC_LIMIT = 10;

const [searchStore, searchSpotlight] = createSpotlight();

const SearchResults = ({ onNavigate }: { onNavigate: (url: string) => void }) => {
  const [game] = useGame();
  const { query } = useSpotlight(searchStore);
  const search = query.trim();
  const isLoggedOut = !localStorage.getItem("token");

  const { user } = useUser(!isLoggedOut);
  const { friends } = useFriends();
  const collectionTypes = collectionTypeData[game];
  const collectionLists = useCollectionLists(
    game,
    useMemo(() => collectionTypes.map((type) => type.value), [collectionTypes]),
    !!search,
  );
  const { docs, isLoading: isDocsLoading } = useDocsSearchIndex(!!search);

  const songList = useSongListStore((state) => state[game]);
  const getAliasList = useAliasListStore((state) => state.getAliasList);
  const aliases = getAliasList(game).aliases;
  const songs = songList.songs;
  const songIndex = useMemo(() => buildSongSearchIndex(songs, aliases), [aliases, songs]);
  const matchedSongs = useMemo(
    () => searchSongsByRelevance(songIndex, search, SONG_LIMIT),
    [songIndex, search],
  );
  const highlightTerms = useMemo(() => getSongHighlightTerms(search), [search]);

  const pages: SearchPage[] = search
    ? searchByRelevance(
        getSearchPages(isLoggedOut, user?.name),
        search,
        (page) => [page.label, page.description],
        Infinity,
      )
    : [...getNavItems(isLoggedOut).filter((item) => item.enabled), helpNavItem];

  const matchedFriends = useMemo(
    () =>
      searchByRelevance(
        friends,
        search,
        (friend) => friendSearchFields(friend, game),
        FRIEND_LIMIT,
      ),
    [friends, game, search],
  );

  const collections = useMemo(
    () =>
      collectionTypes.flatMap((type, index) =>
        collectionLists.lists[index].map((collection) => ({ type, collection })),
      ),
    [collectionLists.lists, collectionTypes],
  );
  const matchedCollections = useMemo(
    () =>
      searchByRelevance(
        collections,
        search,
        ({ collection }) => [collection.name, collection.description],
        COLLECTION_LIMIT,
      ),
    [collections, search],
  );

  const headings = useMemo(
    () => docs.flatMap((doc) => doc.headings.map((heading) => ({ doc, heading }))),
    [docs],
  );
  const matchedHeadings = useMemo(
    () => searchByRelevance(headings, search, ({ heading }) => [heading.text], DOC_LIMIT),
    [headings, search],
  );

  if (
    pages.length === 0 &&
    matchedSongs.length === 0 &&
    matchedFriends.length === 0 &&
    matchedCollections.length === 0 &&
    matchedHeadings.length === 0
  ) {
    return (
      <Spotlight.Empty>
        {collectionLists.isLoading || isDocsLoading ? (
          <Center>
            <Loader size="sm" />
          </Center>
        ) : (
          "没有找到符合条件的结果"
        )}
      </Spotlight.Empty>
    );
  }

  return (
    <>
      {pages.length > 0 && (
        <Spotlight.ActionsGroup label="页面">
          {pages.map((page) => (
            <Spotlight.Action
              key={page.to}
              label={page.label}
              description={page.description}
              leftSection={page.icon}
              highlightQuery
              onClick={() => onNavigate(page.to)}
            />
          ))}
        </Spotlight.ActionsGroup>
      )}
      {matchedSongs.length > 0 && (
        <Spotlight.ActionsGroup label="曲目">
          {matchedSongs.map((song) => (
            <Spotlight.Action
              key={song.id}
              onClick={() => onNavigate(`/songs?game=${game}&song_id=${song.id}`)}
            >
              <Group wrap="nowrap" w="100%">
                <Avatar
                  src={`${ASSET_URL}/${game}/jacket/${songList.getSongResourceId(song.id)}.png!webp`}
                  size={40}
                  radius="sm"
                  imageProps={{ loading: "lazy" }}
                >
                  <IconPhotoOff size={16} />
                </Avatar>
                <Box miw={0} flex={1}>
                  <SongOption song={song} songList={songList} highlight={highlightTerms} />
                </Box>
              </Group>
            </Spotlight.Action>
          ))}
        </Spotlight.ActionsGroup>
      )}
      {matchedFriends.length > 0 && (
        <Spotlight.ActionsGroup label="好友">
          {matchedFriends.map((friend) => {
            const profile = friend.games[game].profile;
            return (
              <Spotlight.Action
                key={friend.user_id}
                label={friend.remark || friend.username}
                description={
                  [friend.remark && friend.username, profile?.name].filter(Boolean).join(" · ") ||
                  undefined
                }
                leftSection={
                  <Avatar
                    src={gameAvatarSrc(game, profile)}
                    name={friend.username}
                    color="initials"
                    size={40}
                    radius="sm"
                  />
                }
                highlightQuery
                onClick={() => onNavigate(profilePath(friend.username))}
              />
            );
          })}
        </Spotlight.ActionsGroup>
      )}
      {matchedHeadings.length > 0 && (
        <Spotlight.ActionsGroup label="帮助文档">
          {matchedHeadings.map(({ doc, heading }) => (
            <Spotlight.Action
              key={`${doc.path}#${heading.id}`}
              label={heading.text}
              description={heading.depth === 1 ? undefined : doc.title}
              leftSection={
                heading.depth === 1 ? <IconFileText stroke={1.5} /> : <IconHash stroke={1.5} />
              }
              highlightQuery
              onClick={() =>
                onNavigate(
                  heading.depth === 1 ? doc.path : `${doc.path}#${encodeURIComponent(heading.id)}`,
                )
              }
            />
          ))}
        </Spotlight.ActionsGroup>
      )}
      {matchedCollections.length > 0 && (
        <Spotlight.ActionsGroup label="收藏品">
          {matchedCollections.map(({ type, collection }) => (
            <Spotlight.Action
              key={`${type.value}-${collection.id}`}
              onClick={() =>
                onNavigate(
                  `/collections?game=${game}&collection_type=${type.value}&collection_id=${collection.id}`,
                )
              }
            >
              <Group wrap="nowrap" w="100%">
                <Box miw={0} flex={1}>
                  <Highlight fz="sm" fw={500} lineClamp={1} highlight={search}>
                    {collection.name}
                  </Highlight>
                  {collection.description && collection.description !== "-" && (
                    <Highlight fz="xs" c="dimmed" lineClamp={1} highlight={search}>
                      {collection.description}
                    </Highlight>
                  )}
                </Box>
                <Badge variant="light" size="sm" flex="none">
                  {type.label}
                </Badge>
              </Group>
            </Spotlight.Action>
          ))}
        </Spotlight.ActionsGroup>
      )}
    </>
  );
};

export const GlobalSearch = () => {
  const os = useOs();
  const { opened } = useSpotlight(searchStore);
  const { navigateFromOverlay } = useBackDismiss(opened, searchSpotlight.close);
  const shortcut = os === "macos" ? "⌘ K" : os === "windows" || os === "linux" ? "Ctrl K" : null;
  const isLoggedOut = typeof window !== "undefined" ? !localStorage.getItem("token") : true;

  return (
    <>
      <Tooltip label={shortcut ? `搜索 ${shortcut}` : "搜索"} position="left">
        <ActionIcon variant="light" size={rem(32)} onClick={searchSpotlight.open} aria-label="搜索">
          <IconSearch stroke={1.5} />
        </ActionIcon>
      </Tooltip>
      <Spotlight.Root store={searchStore} closeOnActionTrigger={false} scrollable>
        <Spotlight.Search
          placeholder={
            isLoggedOut ? "搜索页面、曲目、收藏品或文档" : "搜索页面、曲目、好友、收藏品或文档"
          }
          leftSection={<IconSearch stroke={1.5} />}
        />
        <Spotlight.ActionsList>
          <SearchResults onNavigate={navigateFromOverlay} />
        </Spotlight.ActionsList>
      </Spotlight.Root>
    </>
  );
};
