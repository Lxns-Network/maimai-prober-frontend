import { Alert, Button, Group, Text, Transition } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

interface LoginAlertProps extends React.ComponentPropsWithoutRef<typeof Alert> {
  content: string;
  props?: never;
}

export const LoginAlert = ({ content, ...props }: LoginAlertProps) => {
  const [opened, setOpened] = useState(false);
  const isLoggedOut = !localStorage.getItem("token");
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoggedOut) {
      setOpened(true);
    }
  }, [isLoggedOut]);

  return (
    <Transition mounted={opened} transition="pop" duration={250}>
      {(styles) => (
        <Alert
          variant="light"
          icon={<IconAlertCircle />}
          title="登录提示"
          withCloseButton
          onClose={() => setOpened(false)}
          style={styles}
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
      )}
    </Transition>
  )
}