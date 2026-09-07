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
          <Title order={3} className={classes.title} mb="sm">
            {title}
          </Title>
          <Group gap="xs" mb="md">
            {tags.map((tag) => (
              <Badge key={tag} variant="light" radius="md" size="lg">
                {tag}
              </Badge>
            ))}
          </Group>
          <Text className={classes.description} c="dimmed">
            {description}
          </Text>
        </div>
        <Button
          className={classes.button}
          variant="default"
          radius="md"
          onClick={() => window.open(url, "_blank")}
        >
          {button}
        </Button>
      </Stack>
      <Avatar src={`./product/${image}.webp`} size={96} radius="md" />
    </Card>
  );
};
