import { Container, Title, Text, Button, Group, Center, Image } from '@mantine/core';
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import classes from "./ErrorPage.module.css";

export default function NotFound() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "页面不存在 | maimai DX 查分器";
  });

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