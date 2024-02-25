import { Center, Container, Button, Group, Text, Title, Image, Collapse, Code, ScrollArea } from "@mantine/core";
import { useDisclosure, useViewportSize } from "@mantine/hooks";
import classes from "./ErrorPage.module.css";

export function Fallback({ error, resetErrorBoundary }: { error: Error, resetErrorBoundary: () => void }) {
  const { width } = useViewportSize();
  const [opened, { toggle }] = useDisclosure(false);

  return (
    <Container pt={80} pb={80}>
      <Center>
        <Image src="/error.webp" w={200} h={200} />
      </Center>
      <Title className={classes.title}>发生意料之外的错误</Title>
      <Text className={classes.description} size="lg" c="dimmed" mt="md">
        <code style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{error.message}</code>
      </Text>
      <Collapse in={opened}>
        <Center>
          <Code block maw={650} w={width - 32} fz="sm" mt="lg">
            <ScrollArea>
              {error.stack}
            </ScrollArea>
          </Code>
        </Center>
      </Collapse>
      <Group justify="center" mt="lg">
        <Button className={classes.control} variant="default" size="lg" onClick={toggle}>
          {opened ? "隐藏详细错误" : "查看详细错误"}
        </Button>
        <Button className={classes.control} size="lg" onClick={resetErrorBoundary}>刷新页面</Button>
      </Group>
    </Container>
  );
}