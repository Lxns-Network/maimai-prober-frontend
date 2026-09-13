import { Alert, Button, Group, Text } from "@mantine/core";
import { IconBook } from "@tabler/icons-react";
import { useMediaQuery } from "@mantine/hooks";
import { navigate } from "vike/client/router";

/**
 * Entry point to the sync tutorial, shown at the start of the proxy sync flow.
 *
 * The leading icon costs 38px of inline space, which is more than the narrowest
 * phones can spare while keeping the prompt and the button on one line, so it is
 * dropped below 360px.
 */
export const SyncTutorialAlert = () => {
  // Resolved on the first render so narrow screens never flash the icon before dropping it.
  const hideIcon = useMediaQuery("(max-width: 359px)", undefined, {
    getInitialValueInEffect: false,
  });

  return (
    <Alert
      radius="md"
      icon={hideIcon ? undefined : <IconBook size={18} />}
      px="sm"
      py="xs"
      w="100%"
    >
      <Group justify="space-between" align="center" gap={6}>
        <Text size="sm" fw={500}>
          不知道如何同步？
        </Text>
        <Button
          variant="outline"
          size="compact-sm"
          style={{ flexShrink: 0 }}
          onClick={() => {
            void navigate("/docs/sync");
          }}
        >
          查看教程
        </Button>
      </Group>
    </Alert>
  );
};
