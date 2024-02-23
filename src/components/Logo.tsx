import { Flex, Image, Text } from '@mantine/core'

export default function Logo() {
  return (
    <Flex id="logo" align="center" gap="xs">
      <Image alt="logo" src="/favicon.webp" width={32} height={32} />
      <Text fw="bold" fz="lg">
        maimai DX 查分器
      </Text>
    </Flex>
  );
}