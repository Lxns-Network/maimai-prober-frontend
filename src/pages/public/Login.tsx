import { useEffect, useState } from "react";
import {
  Title,
  PasswordInput,
  TextInput,
  Text,
  Group,
  Anchor,
  Button,
  LoadingOverlay, Paper, Alert, useComputedColorScheme,
} from '@mantine/core';
import { Container } from '@mantine/core';
import { useLocation, useNavigate } from "react-router-dom";
import useAlert from '../../utils/useAlert';
import AlertModal from '../../components/AlertModal';
import { API_URL, RECAPTCHA_SITE_KEY } from '../../main';
import { useForm } from "@mantine/form";
import { validatePassword, validateUserName } from "../../utils/validator";
import { useLocalStorage } from "@mantine/hooks";
import { IconInfoCircle, IconLock, IconUser } from "@tabler/icons-react";
import ReCaptcha from "../../utils/reCaptcha.tsx";
import classes from "../Form.module.css";
import { isTokenExpired, isTokenUndefined } from "../../utils/session.tsx";

export default function Login() {
  const { isAlertVisible, alertTitle, alertContent, openAlert, closeAlert } = useAlert();
  const [visible, setVisible] = useState(false);
  const [game, setGame] = useLocalStorage({ key: 'game' });
  const computedColorScheme = useComputedColorScheme('light');
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state;
  const recaptcha = new ReCaptcha(RECAPTCHA_SITE_KEY, "login");

  useEffect(() => {
    document.title = "登录 | maimai DX 查分器";

    if (state) {
      if (state.expired) {
        openAlert("你已登出", "登录会话已过期，请重新登录。");
      }
      if (state.reset) {
        openAlert("重置成功", "请使用新密码登录。");
      }
    }

    recaptcha.render();

    return () => {
      recaptcha.destroy();
    }
  }, [])

  const form = useForm({
    initialValues: {
      name: '',
      password: '',
    },

    validate: {
      name: (value) => (validateUserName(value) ? null : "用户名格式不正确"),
      password: (value) => (validatePassword(value) ? null : "密码格式不正确"),
    },
  });

  const loginHandler = async (values: any) => {
    setVisible(true);
    try {
      const recaptchaToken = await recaptcha.getToken();
      const res = await fetch(`${API_URL}/user/login?captcha=${recaptchaToken}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!data.success) {
        openAlert("登录失败", data.message);
        return;
      }

      localStorage.setItem("token", data.data.token);
      if (!game) setGame("maimai");
      if (state && state.redirect) {
        navigate(state.redirect);
      } else {
        navigate("/")
      }
    } catch (error) {
      openAlert("登录失败", `${error}`);
    } finally {
      setVisible(false);
    }
  }

  return (
    <Container className={classes.root} size={420}>
      <AlertModal
        title={alertTitle}
        content={alertContent}
        opened={isAlertVisible}
        onClose={closeAlert}
      />
      <Title order={2} size="h2" fw={900} ta="center">
        登录到 maimai DX 查分器
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt="sm">
        请使用 <span className={classes.highlight}>落雪咖啡屋</span> maimai DX 查分器账号
      </Text>
      {!isTokenUndefined() && !isTokenExpired() &&
        <Alert variant="light" color="blue" icon={<IconInfoCircle />} mt="xl">
          你已登录，如果想要切换账号，请先登出。
        </Alert>
      }
      <Paper className={classes.card} withBorder shadow="md" p={30} mt={30} radius="md">
        <LoadingOverlay visible={visible} overlayProps={{ radius: "sm", blur: 2 }} />
        <form onSubmit={form.onSubmit((values) => loginHandler(values))}>
          <TextInput
            name="name"
            label="用户名"
            variant="filled"
            placeholder="请输入你的用户名"
            leftSection={<IconUser size={20} />}
            {...form.getInputProps('name')}
          />
          <Group justify="space-between" mt="md">
            <Text component="label" htmlFor="password" size="sm" fw={500}>密码</Text>
            <Anchor onClick={() => navigate("/forgot-password")} style={(theme) => ({
              paddingTop: 2,
              color: theme.colors[theme.primaryColor][computedColorScheme === 'dark' ? 4 : 6],
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
            leftSection={<IconLock size={20} />}
            {...form.getInputProps('password')}
          />
          <Group justify="flex-end" mt="xl">
            <Button size="sm" variant="default" color="gray" onClick={() => navigate("/register")}>注册</Button>
            <Button size="sm" type="submit">登录</Button>
          </Group>
        </form>
      </Paper>
    </Container>
  );
}