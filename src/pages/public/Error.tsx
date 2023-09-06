import { createStyles, Container, Title, Text, Button, Group, rem } from '@mantine/core';
import { useRouteError } from "react-router-dom";

const useStyles = createStyles((theme) => ({
  root: {
    paddingTop: rem(80),
    paddingBottom: rem(80),
  },

  title: {
    textAlign: 'center',
    fontWeight: 900,
    fontSize: rem(38),
    color: theme.colors.red[6],

    [theme.fn.smallerThan('sm')]: {
      fontSize: rem(32),
    },
  },

  description: {
    maxWidth: rem(540),
    margin: 'auto',
    marginTop: theme.spacing.xl,
    marginBottom: `calc(${theme.spacing.xl} * 1.5)`,
  },
}));

export default function ErrorPage() {
  const { classes } = useStyles();
  const error = useRouteError();

  return (
    <Container className={classes.root}>
      <Title className={classes.title}>
        发生意料之外的错误
      </Title>
      <Text color="dimmed" size="lg" align="center" className={classes.description}>
        {(error as Error)?.message ||
          (error as { statusText?: string })?.statusText}
      </Text>
      <Group position="center">
        <Button color="red" size="md" onClick={() => {window.location.href = "/"}}>返回首页</Button>
      </Group>
    </Container>
  );
}