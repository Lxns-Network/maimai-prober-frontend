import { Flex, Image, Text } from '@mantine/core'

export default function Logo() {
  return (
    <Flex
      component="a"
      id="logo"
      href="/"
      style={{
        color: 'black',
        textDecoration: 'none',
      }}
      align="center"
      gap="xs"
    >
      <Image alt="logo" src="/favicon.webp" w={32} h={32} />
      <Text fw="bold" fz="lg" style={{
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        maimai DX 查分器
      </Text>
    </Flex>
  );
}