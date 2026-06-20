import { Alert, Button, Group, Text } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import React, { useEffect, useState } from "react";
import { navigate } from "vike/client/router";
import { AnimatePresence, motion } from "motion/react";

interface LoginAlertProps extends React.ComponentPropsWithoutRef<typeof Alert> {
  content: string;
  props?: never;
}

export const LoginAlert = ({ content, ...props }: LoginAlertProps) => {
  const [opened, setOpened] = useState(false);
  const isLoggedOut = !localStorage.getItem("token");

  useEffect(() => {
    if (isLoggedOut) {
      setOpened(true);
    }
  }, [isLoggedOut]);

  return (
    <AnimatePresence>
      {opened && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
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
              <Button
                variant="filled"
                onClick={() =>
                  navigate("/login", { pageContext: { redirect: window.location.pathname } })
                }
              >
                登录
              </Button>
              <Button variant="outline" onClick={() => navigate("/register")}>
                注册
              </Button>
            </Group>
          </Alert>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
