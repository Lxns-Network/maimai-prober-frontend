import { ColorSchemeScript } from '@mantine/core';

export default function Head() {
  return (
    <>
      <ColorSchemeScript defaultColorScheme="auto" />
      <link rel="icon" type="image/webp" href="/favicon.webp" />
      <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
      <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
      <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      <link rel="manifest" href="/manifest.webmanifest" />
      <meta name="theme-color" content="#228be6" media="(prefers-color-scheme: light)" />
      <meta name="theme-color" content="#1a1b1e" media="(prefers-color-scheme: dark)" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-title" content="maimai DX 查分器" />
      <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    </>
  );
}
