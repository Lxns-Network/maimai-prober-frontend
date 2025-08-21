import { AspectRatio, Badge, Card, Center, Image, Text } from "@mantine/core";
import classes from "@/pages/Page.module.css";
import { getTrophyColor } from "@/utils/color.ts";
import { Marquee } from "@/components/Marquee.tsx";
import { CollectionProps } from "@/types/player";
import React from "react";
import useFixedGame from "@/hooks/useFixedGame.ts";

interface CollectionCardProps {
  collection: CollectionProps | null;
  collectionType: string | null;
  style?: React.CSSProperties;
}

export const CollectionCard = ({ collection, collectionType, style }: CollectionCardProps) => {
  const [game] = useFixedGame();

  if (!collection) return;

  return (
    <Card radius="md" mt="md" p="md" withBorder className={classes.card} style={style}>
      <Text c="dimmed" size="xs" tt="uppercase" fw={700}>
        {(collection.description || "").length > 1 && collection.description}
      </Text>
      <Text fw={700} size="xl">
        {collection.name}
      </Text>
      <Center>
        {game === "maimai" && collectionType === "plate" && (
          <AspectRatio ratio={720 / 116} w="100%" mt="md">
            <Image src={`https://assets2.lxns.net/${game}/plate/${collection.id}.png`} />
          </AspectRatio>
        )}
        {collectionType === "trophy" && (
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
        {collectionType === "icon" && (
          <AspectRatio ratio={1} w={128} mt="md">
            <Image src={`https://assets2.lxns.net/${game}/icon/${collection.id}.png`} />
          </AspectRatio>
        )}
        {collectionType === "frame" && collection.id !== 1 && (
          <AspectRatio ratio={270 / 113} w="100%" mt="md">
            <Image src={`https://assets2.lxns.net/${game}/frame/${collection.id}.png`} />
          </AspectRatio>
        )}
        {game === "chunithm" && collectionType === "plate" && (
          <AspectRatio ratio={576 / 228} w="100%" mt="md">
            <Image src={`https://assets2.lxns.net/${game}/plate/${collection.id}.png`} />
          </AspectRatio>
        )}
        {collectionType === "character" && (
          <AspectRatio ratio={1} w={128} mt="md">
            <Image src={`https://assets2.lxns.net/${game}/character/${collection.id}.png`} />
          </AspectRatio>
        )}
      </Center>
    </Card>
  )
}