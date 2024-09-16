import { PageProps } from "./Page.tsx";
import { Box, Text, Title } from "@mantine/core";
import classes from "./PageHeader.module.css";

export const PageHeader = ({ meta }: PageProps) => {
  return (
    <div className={classes.wrapper}>
      <Box className={classes.header}>
        <Title className={classes.title}>{meta.title}</Title>
        <Text className={classes.description}>{meta.description}</Text>
      </Box>
    </div>
  )
}