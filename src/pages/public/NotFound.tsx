import { Container, Title, Text, Button, Group, Center, Image } from '@mantine/core';
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

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
      <Title order={2} ta="center">页面不存在</Title>
      <Text c="dimmed" ta="center" mt="md">
        你访问的页面不存在，可能已经被删除或者地址错误。
      </Text>
      <Group justify="center" mt="lg">
        <Button size="md" onClick={() => navigate("/")}>返回首页</Button>
      </Group>
    </Container>
  );
}