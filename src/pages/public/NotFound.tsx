import { Container, Title, Text, Button, Group, Center, Image } from '@mantine/core';
import classes from "./ErrorPage.module.css";
import { navigate } from 'vike/client/router';

export default function NotFound() {
  return (
    <Container pt={80} pb={80}>
      <Center>
        <Image src="/error.webp" w={200} h={200} />
      </Center>
      <Title className={classes.title}>页面不存在</Title>
      <Text className={classes.description} size="lg" c="dimmed" mt="md">
        你访问的页面不存在，可能已经被删除或者地址错误。
      </Text>
      <Group justify="center" mt="lg">
        <Button className={classes.control} size="lg" onClick={() => navigate("/")}>返回首页</Button>
      </Group>
    </Container>
  );
}
