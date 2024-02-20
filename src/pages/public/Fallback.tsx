import { Center, Container, Button, Group, Text, Title, Image, Collapse, Code, ScrollArea } from "@mantine/core";
import { useDisclosure, useViewportSize } from "@mantine/hooks";

export function Fallback({ error, resetErrorBoundary }: { error: Error, resetErrorBoundary: () => void }) {
  const { width } = useViewportSize();
  const [opened, { toggle }] = useDisclosure(false);

  return (
    <Container pt={80} pb={80}>
      <Center>
        <Image src="/error.webp" w={200} h={200} />
      </Center>
      <Title order={2} ta="center">发生意料之外的错误</Title>
      <Text c="dimmed" ta="center" mt="md">
        <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{error.message}</pre>
      </Text>
      <Collapse in={opened}>
        <Center>
          <Code block maw={650} w={width - 33}>
            <ScrollArea>
              {error.stack}
            </ScrollArea>
          </Code>
        </Center>
      </Collapse>
      <Group justify="center" mt="lg">
        <Button variant="default" size="md" onClick={toggle}>查看详细错误</Button>
        <Button size="md" onClick={resetErrorBoundary}>刷新页面</Button>
      </Group>
    </Container>
  );
}