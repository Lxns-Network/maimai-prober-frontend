import { ReactNode } from "react";
import { Flex, Text } from "@mantine/core";
import { VerifiedBadge } from "@/components/VerifiedBadge.tsx";

interface OAuthAppNameProps {
  name: string;
  verified?: boolean;
  children?: ReactNode;
}

// The last character, the badge and any trailing controls share one unbreakable box so they never wrap apart.
export const OAuthAppName = ({ name, verified, children }: OAuthAppNameProps) => {
  const chars = Array.from(name);
  const tail = chars.pop();

  return (
    <Text fw={500} size="md">
      {chars.join("")}
      <Flex component="span" display="inline-flex" align="center" gap={4}>
        {tail}
        {verified && <VerifiedBadge />}
        {children}
      </Flex>
    </Text>
  );
};
