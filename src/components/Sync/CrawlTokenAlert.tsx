import { Alert, Button, Text } from "@mantine/core";
import { IconAlertCircle, IconRefresh } from "@tabler/icons-react";

export const CrawlTokenAlert = ({ token, resetHandler }: any) => {
  const getExpireTime = (crawlToken: string) => {
    return Math.floor(((JSON.parse(atob(crawlToken.split('.')[1])).exp - new Date().getTime() / 1000)) / 60)
  }

  const isTokenExpired = token && getExpireTime(token) < 0;
  const alertColor = isTokenExpired ? 'yellow' : 'blue';

  return (
    <Alert variant="light" icon={<IconAlertCircle />} title="链接有效期提示" color={alertColor}>
      <Text size="sm" mb="md">
        {token ? `该链接${
          isTokenExpired ? "已失效，" : `将在 ${getExpireTime(token) + 1} 分钟内失效，逾时`
        }请点击下方按钮刷新 OAuth 链接。` : "链接未生成，请点击下方按钮生成 OAuth 链接。"}
      </Text>
      <Button variant="outline" leftSection={<IconRefresh size={20} />} onClick={resetHandler} color={alertColor}>
        {token ? "刷新链接" : "生成链接"}
      </Button>
    </Alert>
  );
};