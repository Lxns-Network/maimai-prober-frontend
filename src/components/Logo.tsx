import {Flex, Image, Badge, Text, Space, rem} from '@mantine/core'
import {useMediaQuery} from "@mantine/hooks";

export default function Logo() {
  const small = useMediaQuery(`(max-width: ${rem(400)})`);

  return (
    <Flex id="logo" align="center">
      <Image alt="logo" src="/favicon.webp" width={32} height={32} />
      <Space w="xs" />
      <Text fw={700} fz={18} truncate>
        maimai DX 查分器
      </Text>
      <Space w="xs" />
      <Badge display={
        small ? "none" : "flex"
      }>测试版</Badge>
    </Flex>
  );
}