import { Alert, Button, Group, Text } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

interface LoginAlertProps extends React.ComponentPropsWithoutRef<typeof Alert> {
  content: string;
  props?: any;
}

export const LoginAlert = ({ content, ...props }: LoginAlertProps) => {
  const [opened, setOpened] = useState(false);
  const isLoggedOut = !Boolean(localStorage.getItem("token"));
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoggedOut) {
      setOpened(true);
    }
  }, [isLoggedOut]);

  if (!opened) {
    return null;
  }

  return (
    <Alert
      variant="light"
      icon={<IconAlertCircle />}
      title="登录提示"
      withCloseButton
      onClose={() => setOpened(false)}
      {...props}
    >
      <Text size="sm" mb="md">
        {content}
      </Text>
      <Group>
        <Button variant="filled" onClick={() => navigate("/login", { replace: true, state: { redirect: window.location.pathname } })}>
          登录
        </Button>
        <Button variant="outline" onClick={() => navigate("/register")}>
          注册
        </Button>
      </Group>
    </Alert>
  )
}