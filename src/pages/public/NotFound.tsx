import { Container, Title, Text, Button, Group } from '@mantine/core';
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import classes from "./NotFound.module.css";

export default function NotFound() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "页面不存在 | maimai DX 查分器";
  });

  return (
    <Container className={classes.root}>
      <Title ta="center">页面不存在</Title>
      <Text c="dimmed" ta="center" mt="md">
        你访问的页面不存在，可能已经被删除或者地址错误。
      </Text>
      <Group justify="center" mt="lg">
        <Button size="md" onClick={() => navigate("/")}>返回首页</Button>
      </Group>
    </Container>
  );
}