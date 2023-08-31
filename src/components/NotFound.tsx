import { createStyles, Container, Title, Text, Button, Group, rem } from '@mantine/core';
import { useNavigate } from "react-router-dom";

const useStyles = createStyles((theme) => ({
  root: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "calc(100vh - 112px)",
  },

  content: {
    position: 'relative',
    zIndex: 1,
  },

  title: {
    fontFamily: `Greycliff CF, ${theme.fontFamily}`,
    textAlign: 'center',
    fontWeight: 900,
    fontSize: rem(38),

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

export default function NotFound() {
  const { classes } = useStyles();
  const navigate = useNavigate();

  return (
    <Container className={classes.root}>
      <div className={classes.content}>
        <Title className={classes.title}>页面不存在</Title>
        <Text color="dimmed" size="lg" align="center" className={classes.description}>
          你访问的页面不存在，可能已经被删除或者地址错误。
        </Text>
        <Group position="center">
          <Button size="md" onClick={() => navigate("/")}>返回首页</Button>
        </Group>
      </div>
    </Container>
  );
}