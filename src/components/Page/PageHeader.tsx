import { PageProps } from "./Page.tsx";
import { ActionIcon, Box, Flex, Group, Text, Title, Tooltip } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { Link } from "@/components/Link";
import classes from "./PageHeader.module.css";
import useOverlayNavigationStore from "@/hooks/useOverlayNavigationStore";

export const PageHeader = ({ meta, badge, actions, backLink }: PageProps) => {
  const returnLabel = useOverlayNavigationStore((state) => state.returnLabel);
  const backLabel = returnLabel ?? backLink?.label;
  const backIconProps = {
    variant: "subtle",
    color: "gray",
    size: "lg",
    mt: 3,
    style: { flexShrink: 0 },
    "aria-label": backLabel,
    children: <IconArrowLeft size={20} />,
  };

  const title = (
    <Title className={classes.title} textWrap="balance" mb={badge ? 0 : undefined}>
      {meta.title}
    </Title>
  );

  const titleBlock = (
    <Group align="flex-start" wrap="nowrap" gap="xs" className={classes.titleContainer}>
      {backLabel && (
        <Tooltip label={backLabel}>
          {returnLabel ? (
            <ActionIcon {...backIconProps} onClick={() => window.history.back()} />
          ) : backLink ? (
            <ActionIcon {...backIconProps} component={Link} to={backLink.to} />
          ) : null}
        </Tooltip>
      )}
      <Box style={{ flex: 1, minWidth: 0 }}>
        {badge ? (
          <Flex
            align="center"
            justify={{ base: "center", md: "flex-start" }}
            wrap="wrap"
            gap="xs"
            mb={5}
          >
            {title}
            {badge}
          </Flex>
        ) : (
          title
        )}
        <Text className={classes.description}>{meta.description}</Text>
      </Box>
    </Group>
  );

  return (
    <div className={classes.wrapper}>
      <Box className={classes.header}>
        {actions ? (
          <Flex
            className={classes.headerContent}
            data-compact={backLabel ? true : undefined}
            align="center"
            wrap={backLabel ? { base: "nowrap", md: "wrap" } : "wrap"}
            gap="sm"
          >
            {titleBlock}
            <Box className={classes.actions}>{actions}</Box>
          </Flex>
        ) : (
          titleBlock
        )}
      </Box>
    </div>
  );
};
