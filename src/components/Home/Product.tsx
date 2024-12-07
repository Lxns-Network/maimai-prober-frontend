import { Avatar, Badge, Button, Card, Group, Stack, Text, Title } from "@mantine/core";
import classes from "./Product.module.css";

interface ProductProps {
  title: string;
  tags: string[];
  description: string;
  image: string;
  button: string;
  url: string;
}

export const Product = ({ title, tags, description, image, button, url }: ProductProps) => {
  return (
    <Card className={classes.product} withBorder radius="md">
      <Stack align="flex-start" justify="space-between" style={{ flex: 1 }}>
        <div>
          <Title order={2} mb={7}>{title}</Title>
          <Group gap="xs" mb="md">
            {tags.map((tag) => (
              <Badge key={tag} variant="light" radius="md" size="lg">{tag}</Badge>
            ))}
          </Group>
          <Text size="sm" c="dimmed" lh={1.6}>
            {description}
          </Text>
        </div>
        <Button className={classes.control} variant="default" size="lg" onClick={() =>
          window.open(url, "_blank")
        }>
          {button}
        </Button>
      </Stack>
      <Avatar src={`./product/${image}.webp`} h="auto" w={96} radius="md" />
    </Card>
  )
}