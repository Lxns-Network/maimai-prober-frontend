import {Title, Card, PasswordInput, TextInput, Text, Group, Anchor, Button, LoadingOverlay} from '@mantine/core';
import { Container, rem, createStyles } from '@mantine/core';
import { useNavigate } from "react-router-dom";
import {
  IconUser,
  IconLock,
} from '@tabler/icons-react';
import reCAPTCHA from "../utils/reCAPTCHA";
import useAlert from '../utils/useAlert';
import useFormInput from "../utils/useFormInput";
import Alert from './Layout/Alert';
import {useState} from "react";

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
  const { isAlertVisible, alertTitle, alertContent, openAlert, closeAlert } = useAlert();
  const { classes } = useStyles();
  const [visible, setVisible] = useState(false);
  const recaptcha = new reCAPTCHA("6LefxhIjAAAAADI0_XvRZmguDUharyWf3kGFhxqX", "login");
  const navigate = useNavigate();

  const nameInput = useFormInput('');
  const passwordInput = useFormInput('');

  const validationRules = {
    name: "用户名不能为空",
    password: "密码不能为空",
  };

  const validateInputs = (inputs: any) => {
    for (const [inputName, errorMessage] of Object.entries(validationRules)) {
      if (!inputs[inputName]) {
        openAlert("登录失败", errorMessage);
        return false;
      }
    }

    return true;
  };

  const submitLogin = async () => {
    if (!validateInputs({
      name: nameInput.value,
      password: passwordInput.value,
    })) {
      return;
    }
    setVisible(true);
    fetch(`http://localhost:7000/api/v0/user/login?recaptcha=${await recaptcha.getToken()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        "name": nameInput.value,
        "password": passwordInput.value,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        setVisible(false);
        if (data.success) {
          localStorage.setItem("token", data.data.token);
          navigate("/")
        } else {
          openAlert("登录失败", data.message);
        }
      })
      .catch((error) => {
        setVisible(false);
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
      <Card radius="md" shadow="md" p="xl" withBorder sx={(theme) => ({
        backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[8] : theme.white,
      })}>
        <LoadingOverlay visible={visible} overlayBlur={2} />
        <TextInput
          name="name"
          label="用户名"
          variant="filled"
          placeholder="请输入你的用户名"
          icon={<IconUser size="1rem" />}
          {...nameInput}
        />
        <Group position="apart" mt="md">
          <Text component="label" htmlFor="password" size="sm" weight={500}>密码</Text>
          <Anchor<'a'> href="#" onClick={(event) => event.preventDefault()} sx={(theme) => ({
            paddingTop: 2,
            color: theme.colors[theme.primaryColor][theme.colorScheme === 'dark' ? 4 : 6],
            fontWeight: 500,
            fontSize: theme.fontSizes.xs,
          })}>
            忘记密码？
          </Anchor>
        </Group>
        <PasswordInput
          name="password"
          variant="filled"
          placeholder="请输入你的密码"
          icon={<IconLock size="1rem" />}
          {...passwordInput}
        />
        <Group position="right" mt="xl">
          <Button size="sm" variant="default" color="gray" onClick={() => navigate("/register")}>注册</Button>
          <Button size="sm" onClick={submitLogin}>登录</Button>
        </Group>
      </Card>
    </Container>
  );
}