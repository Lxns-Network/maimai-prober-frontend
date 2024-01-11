import { useEffect, useState } from "react";
import {
  Title,
  Card,
  PasswordInput,
  TextInput,
  Text,
  Group,
  Anchor,
  Button,
  LoadingOverlay,
} from '@mantine/core';
import { Container, rem, createStyles } from '@mantine/core';
import { useLocation, useNavigate } from "react-router-dom";
import useAlert from '../../utils/useAlert';
import AlertModal from '../../components/AlertModal';
import { API_URL, RECAPTCHA_SITE_KEY } from '../../main';
import { useForm } from "@mantine/form";
import { validatePassword, validateUserName } from "../../utils/validator";
import { useLocalStorage } from "@mantine/hooks";
import { IconLock, IconUser } from "@tabler/icons-react";
import ReCaptcha from "../../utils/reCaptcha.tsx";

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
  const [game, setGame] = useLocalStorage({ key: 'game' });
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
    <Container className={classes.root} size={400}>
      <AlertModal
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
        <form onSubmit={form.onSubmit((values) => loginHandler(values))}>
          <TextInput
            name="name"
            label="用户名"
            variant="filled"
            placeholder="请输入你的用户名"
            icon={<IconUser size={20} />}
            {...form.getInputProps('name')}
          />
          <Group position="apart" mt="md">
            <Text component="label" htmlFor="password" size="sm" weight={500}>密码</Text>
            <Anchor onClick={() => navigate("/forgot-password")} sx={(theme) => ({
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
            icon={<IconLock size={20} />}
            {...form.getInputProps('password')}
          />
          <Group position="right" mt="xl">
            <Button size="sm" variant="default" color="gray" onClick={() => navigate("/register")}>注册</Button>
            <Button size="sm" type="submit">登录</Button>
          </Group>
        </form>
      </Card>
    </Container>
  );
}