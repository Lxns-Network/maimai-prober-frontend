import React, { useState } from 'react';
import { Title, Card, PasswordInput, TextInput, Text, Group, Anchor, Button } from '@mantine/core';
import { Container, rem, createStyles } from '@mantine/core';
import { useNavigate } from "react-router-dom";
import {
  IconUser,
  IconLock,
} from '@tabler/icons-react';
import reCAPTCHA from "../utils/reCAPTCHA";
import Alert from './Layout/Alert';

const useStyles = createStyles((theme) => ({
  root: {
    paddingTop: rem(80),
    paddingBottom: rem(80),
  },

  highlight: {
    position: 'relative',
    backgroundColor: theme.fn.variant({ variant: 'light', color: theme.primaryColor }).background,
    borderRadius: theme.radius.sm,
    padding: `${rem(4)} ${rem(8)}`,
    color: theme.colors[theme.primaryColor][theme.colorScheme === 'dark' ? 4 : 6],
  },
}));

export default function Login() {
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const { classes } = useStyles();
  const recaptcha = new reCAPTCHA("6LefxhIjAAAAADI0_XvRZmguDUharyWf3kGFhxqX", "login");
  const navigate = useNavigate();

  // Alert
  const [isAlertVisible, setAlertVisible] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertContent, setAlertContent] = useState('');

  const openAlert = (title: string, content: string) => {
    setAlertTitle(title);
    setAlertContent(content);
    setAlertVisible(true);
  };

  const closeAlert = () => {
    setAlertVisible(false);
  };

  // Input
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.currentTarget;
    if (name === "name") {
      setUsername(value);
    } else if (name === "password") {
      setPassword(value);
    }
  };

  const handleLoginClick = async () => {
    fetch(`http://localhost:7000/api/v0/user/login?recaptcha=${await recaptcha.getToken()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        "name": username,
        "password": password,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          localStorage.setItem("token", data.data.token);
          navigate("/")
        } else {
          openAlert("登录失败", "请检查你的用户名和密码是否正确。");
        }
      })
      .catch((error) => {
        openAlert("登录失败", error);
      });
  };

  return (
    <Container className={classes.root} size={400}>
      <Alert
        title={alertTitle}
        content={alertContent}
        opened={isAlertVisible}
        onClose={closeAlert}
      />
      <Title order={2} size="h2" weight={900} align="center">
        登录到 maimai DX 查分器
      </Title>
      <Text color="dimmed" size="sm" align="center" mt="sm" mb="xl">
        请使用 <span className={classes.highlight}>落雪咖啡屋</span> maimai DX 查分器账号
      </Text>
      <Card
        radius="md"
        shadow="md"
        withBorder
        p="xl"
        sx={(theme) => ({
          backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[8] : theme.white,
        })}
      >
        <TextInput
          name="name"
          label="用户名"
          variant="filled"
          placeholder="请输入你的用户名"
          icon={<IconUser size="1rem" />}
          onChange={handleInputChange}
        />
        <Group position="apart" mt="md">
          <Text component="label" htmlFor="password" size="sm" weight={500}>
            密码
          </Text>
          <Anchor<'a'>
            href="#"
            onClick={(event) => event.preventDefault()}
            sx={(theme) => ({
              paddingTop: 2,
              color: theme.colors[theme.primaryColor][theme.colorScheme === 'dark' ? 4 : 6],
              fontWeight: 500,
              fontSize: theme.fontSizes.xs,
            })}
          >
            忘记密码？
          </Anchor>
        </Group>
        <PasswordInput
          name="password"
          variant="filled"
          placeholder="请输入你的密码"
          icon={<IconLock size="1rem" />}
          onChange={handleInputChange}
        />
        <Group position="right" mt="xl">
          <Button
            size="sm"
            variant="default"
            color="gray"
            onClick={() => navigate("/register")}
          >
            注册
          </Button>
          <Button size="sm" onClick={handleLoginClick}>
            登录
          </Button>
        </Group>
      </Card>
    </Container>
  );
}