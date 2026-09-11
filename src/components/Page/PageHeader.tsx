import { PageProps } from "./Page.tsx";
import { Box, Flex, Text, Title } from "@mantine/core";
import classes from "./PageHeader.module.css";

export const PageHeader = ({ meta, actions }: PageProps) => {
  return (
    <div className={classes.wrapper}>
      <Box className={classes.header}>
        {actions ? (
          <Flex
            className={classes.headerContent}
            justify="space-between"
            align="center"
            wrap="wrap"
            gap="sm"
          >
            <Box className={classes.titleContainer}>
              <Title className={classes.title} textWrap="balance">
                {meta.title}
              </Title>
              <Text className={classes.description}>{meta.description}</Text>
            </Box>
            <Box className={classes.actions}>{actions}</Box>
          </Flex>
        ) : (
          <Box>
            <Title className={classes.title} textWrap="balance">
              {meta.title}
            </Title>
            <Text className={classes.description}>{meta.description}</Text>
          </Box>
        )}
      </Box>
    </div>
  );
};
