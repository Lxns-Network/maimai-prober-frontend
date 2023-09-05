import { Flex, Image, Badge, Text, Space } from '@mantine/core'

export default function Logo() {
  return (
    <Flex id="logo" align="center">
      <Image alt="logo" src="/favicon.ico" width={24} height={24} />
      <Space w="xs" />
      <Text fw={700} fz={18}>
        maimai DX 查分器
      </Text>
      <Space w="xs" />
      <Badge>测试版</Badge>
    </Flex>
  );
}