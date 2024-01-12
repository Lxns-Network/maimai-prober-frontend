import { useNavigate } from "react-router-dom";
import { Alert, Button, Group, Text} from "@mantine/core";
import Icon from "@mdi/react";
import { mdiAlertCircleOutline } from "@mdi/js";

export const NotFoundAlert = () => {
  const navigate = useNavigate();

  return (
    <Alert radius={0} icon={<Icon path={mdiAlertCircleOutline} />} title="没有获取到游戏数据" color="red">
      <Text size="sm" mb="md">
        请检查你的查分器账号是否已经绑定游戏账号。
      </Text>
      <Group>
        <Button variant="outline" color="red" onClick={() => navigate("/user/sync")}>
          同步游戏数据
        </Button>
      </Group>
    </Alert>
  )
}