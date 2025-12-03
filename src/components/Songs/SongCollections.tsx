import { SongCollectionItemProps } from "@/utils/api/song/song.tsx";
import {
  AspectRatio,
  Badge,
  Box,
  Card,
  Center,
  Group,
  Image,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
  UnstyledButton
} from "@mantine/core";
import { IconAward } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import useFixedGame from "@/hooks/useFixedGame.ts";
import { getTrophyColor } from "@/utils/color.ts";
import { Marquee } from "@/components/Marquee.tsx";
import React, { useMemo } from "react";
import classes from "@/pages/Page.module.css";
import scoreClasses from "@/components/Scores/ScoreModal.module.css";

interface SongCollectionsComponentProps {
  collections: SongCollectionItemProps[] | null;
  style?: React.CSSProperties;
}

const collectionTypeLabelMap: Record<string, string> = {
  plate: "姓名框",
  frame: "背景",
  icon: "头像",
  trophy: "称号",
  character: "角色",
};

const CollectionItem = ({ collection }: { collection: SongCollectionItemProps }) => {
  const [game] = useFixedGame();
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/collections?game=${game}&collection_type=${collection.type}&collection_id=${collection.id}`);
  };

  const renderCollectionPreview = () => {
    const type = collection.type;

    if (type === "trophy") {
      if (collection.color === "image") {
        return (
          <Center h={26}>
            <AspectRatio ratio={608 / 74}>
                <Image src={`https://assets2.lxns.net/${game}/trophy/${collection.id}.png`} />
            </AspectRatio>
          </Center>
        );
      }
      return (
        <Badge
          variant="light"
          size="lg"
          radius="xl"
          w="100%"
          color={getTrophyColor(collection.color || "normal")}
          children={
            <Marquee>
              <Text fz="sm" style={{ whiteSpace: "pre-wrap" }}>
                {collection.name}
              </Text>
            </Marquee>
          }
        />
      );
    }

    if (type === "plate") {
      const ratio = game === "maimai" ? 720 / 116 : 576 / 228;
      return (
        <AspectRatio ratio={ratio} w="100%">
          <Image src={`https://assets2.lxns.net/${game}/plate/${collection.id}.png`} />
        </AspectRatio>
      );
    }

    if (type === "icon" || type === "character") {
      return (
        <AspectRatio ratio={1} w={64}>
          <Image src={`https://assets2.lxns.net/${game}/${type}/${collection.id}.png`} />
        </AspectRatio>
      );
    }

    if (type === "frame" && collection.id !== 1) {
      return (
        <AspectRatio ratio={270 / 113} w="100%">
          <Image src={`https://assets2.lxns.net/${game}/frame/${collection.id}.png`} />
        </AspectRatio>
      );
    }

    return null;
  };

  return (
    <UnstyledButton onClick={handleClick} style={{ width: "100%" }}>
      <Paper className={[scoreClasses.subParameters, scoreClasses.subParametersButton].join(' ')} p="sm">
        <Stack gap="xs" align="center">
          {renderCollectionPreview()}
          <Text fz="sm" fw={500} ta="center" lineClamp={1}>
            {collection.name}
          </Text>
        </Stack>
      </Paper>
    </UnstyledButton>
  );
};

const CollectionSection = ({ title, collections }: { title: string; collections: SongCollectionItemProps[] }) => {
  if (!collections || collections.length === 0) return null;

  return (
    <Box>
      <Text c="dimmed" size="sm" fw={500} mb="xs">
        {title}
      </Text>
      <SimpleGrid cols={{ base: 2, xs: 3 }} spacing="sm">
        {collections.map((collection) => (
          <CollectionItem key={`${collection.type}-${collection.id}`} collection={collection} />
        ))}
      </SimpleGrid>
    </Box>
  );
};

export const SongCollections = ({ collections, style }: SongCollectionsComponentProps) => {
  const [game] = useFixedGame();

  // 按类型分组收藏品
  const groupedCollections = useMemo(() => {
    if (!collections || collections.length === 0) return null;

    const grouped: Record<string, SongCollectionItemProps[]> = {};
    collections.forEach((item) => {
      if (!grouped[item.type]) {
        grouped[item.type] = [];
      }
      grouped[item.type].push(item);
    });
    return grouped;
  }, [collections]);

  if (!groupedCollections) return null;

  const displayOrder = game === "maimai"
    ? ["plate", "frame", "icon", "trophy"]
    : ["plate", "character", "icon", "trophy"];

  return (
    <Card radius="md" p="md" withBorder className={classes.card} style={style}>
      <Group gap="xs" mb="md">
        <IconAward size={20} />
        <Title order={5}>
          关联收藏品
        </Title>
      </Group>
      <Stack gap="md">
        {displayOrder.map((type) => (
          groupedCollections[type] && groupedCollections[type].length > 0 && (
            <CollectionSection
              key={type}
              title={collectionTypeLabelMap[type]}
              collections={groupedCollections[type]}
            />
          )
        ))}
      </Stack>
    </Card>
  );
};
