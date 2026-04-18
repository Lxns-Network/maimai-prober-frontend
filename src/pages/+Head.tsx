import { ColorSchemeScript } from '@mantine/core';

export default function Head() {
  return (
    <>
      <ColorSchemeScript defaultColorScheme="auto" />
      <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      <link rel="manifest" href="/manifest.webmanifest" />
      <meta name="theme-color" content="#228be6" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-title" content="maimai DX 查分器" />
      <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    </>
  );
}
