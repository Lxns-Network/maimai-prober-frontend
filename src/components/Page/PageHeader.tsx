import { PageProps } from "./Page.tsx";
import { ActionIcon, Box, Group, Text, Title, Tooltip } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { Link } from "@/components/Link";
import classes from "./PageHeader.module.css";
import { useOverlayNavigationStore } from "@/hooks/useOverlayNavigationStore";

export const PageHeader = ({ meta, actions, backLink }: PageProps) => {
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

  return (
    <div className={classes.wrapper}>
      <Box className={classes.header}>
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
          <Group align="flex-start" wrap="nowrap" gap="xs" style={{ flex: 1, minWidth: 0 }}>
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
              <Title className={classes.title} textWrap="balance">
                {meta.title}
              </Title>
              <Text className={classes.description}>{meta.description}</Text>
            </Box>
          </Group>
          {actions && (
            <Group gap="xs" wrap="nowrap" style={{ flexShrink: 0 }}>
              {actions}
            </Group>
          )}
        </Group>
      </Box>
    </div>
  );
};
