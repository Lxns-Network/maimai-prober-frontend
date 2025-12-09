import { useEffect, useState, useMemo } from "react";
import {
  Title, PasswordInput, TextInput, Text, Group, Anchor, Button, LoadingOverlay, Alert, useComputedColorScheme,
  Card, SegmentedControl, Center
} from '@mantine/core';
import { Container } from '@mantine/core';
import { useLocation, useNavigate } from "react-router-dom";
import { API_URL, RECAPTCHA_SITE_KEY } from '@/main';
import { useForm } from "@mantine/form";
import { validateEmail, validatePassword, validateUserName } from "@/utils/validator.ts";
import { IconAlertCircle, IconLock, IconMail, IconUser } from "@tabler/icons-react";
import ReCaptcha from "@/utils/reCaptcha.ts";
import classes from "../Form.module.css";
import { isTokenExpired, isTokenUndefined } from "@/utils/session.ts";
import { openAlertModal, openRetryModal } from "@/utils/modal.tsx";
import { PasskeyLogin } from "@/components/Settings/PasskeyLogin.tsx";

interface FormValues {
  name?: string;
  email?: string;
  password: string;
}

export default function Login() {
  const [method, setMethod] = useState<'name' | 'email'>('name');
  const [visible, setVisible] = useState(false);
  const computedColorScheme = useComputedColorScheme('light');
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state;
  const recaptcha = useMemo(() => new ReCaptcha(RECAPTCHA_SITE_KEY, "login"), []);

  useEffect(() => {
    document.title = "登录 | maimai DX 查分器";
  }, [])

  useEffect(() => {
    if (state) {
      if (state.expired) {
        openAlertModal("你已登出", "登录会话已过期，请重新登录。")
      }
      if (state.reset) {
        openAlertModal("重置成功", "请使用新密码登录。");
      }
    }
  }, [state])

  useEffect(() => {
    recaptcha.render();

    return () => {
      recaptcha.destroy();
    }
  }, [recaptcha])

  const form = useForm<FormValues>({
    initialValues: {
      name: "",
      email: "",
      password: "",
    },

    validate: (values) => {
      const errors: Record<string, string | null> = {};

      if (!values.name && !values.email) {
        errors.name = "用户名不能为空";
        errors.email = "邮箱不能为空";
      } else {
        if (values.name && validateUserName(values.name, { allowEmpty: false })) {
          errors.name = validateUserName(values.name, { allowEmpty: false });
        }
        if (values.email && validateEmail(values.email, { allowEmpty: false })) {
          errors.email = validateEmail(values.email, { allowEmpty: false });
        }
      }

      if (validatePassword(values.password, { allowEmpty: false })) {
        errors.password = validatePassword(values.password, { allowEmpty: false });
      }

      return errors;
    },

    transformValues: (values) => {
      if (method === 'name') {
        return {
          name: values.name,
          password: values.password,
        }
      } else {
        return {
          email: values.email,
          password: values.password,
        }
      }
    },
  });

  const loginHandler = async (values: FormValues) => {
    setVisible(true);

    try {
      const recaptchaToken = await recaptcha.getToken();

      const res = await fetch(`${API_URL}/user/login?captcha=${recaptchaToken}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }

      localStorage.setItem("token", data.data.token);

      if (state && state.redirect && state.redirect !== "/login") {
        navigate(state.redirect, { replace: true });
      } else {
        navigate("/", { replace: true })
      }
    } catch (error) {
      openRetryModal("登录失败", `${error}`, () => loginHandler(values));
    } finally {
      setVisible(false);
    }
  }

  return (
    <Container className={classes.root} size={420}>
      <Title order={2} size="h2" fw={900} ta="center">
        登录到 maimai DX 查分器
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt="sm">
        请使用 <span className={classes.highlight}>落雪咖啡屋</span> maimai DX 查分器账号登录
      </Text>
      {!isTokenUndefined() && !isTokenExpired() &&
        <Alert variant="light" color="blue" icon={<IconAlertCircle />} mt="xl" radius="md">
          你已登录，如果想要切换账号，请先登出。
        </Alert>
      }
      <SegmentedControl
        fullWidth mt={30} radius="md"
        data={[{
          label: (
            <Center style={{ gap: 10 }}>
              <IconUser size={16} />
              <span>用户名登录</span>
            </Center>
          ),
          value: "name"
        }, {
          label:  (
            <Center style={{ gap: 10 }}>
              <IconMail size={16} />
              <span>邮箱登录</span>
            </Center>
          ),
          value: "email"
        }]}
        value={method}
        onChange={(value) => {
          setMethod(value as 'name' | 'email');
          form.setFieldValue('name', '');
          form.setFieldValue('email', '');
        }}
      />
      <Card className={classes.card} withBorder shadow="md" p={30} mt="md">
        <LoadingOverlay visible={visible} overlayProps={{ radius: "sm", blur: 2 }} zIndex={2} />
        <form onSubmit={form.onSubmit(loginHandler)}>
          {method === 'name' && (
            <TextInput
              name="name"
              label="用户名"
              variant="filled"
              placeholder="请输入你的用户名"
              leftSection={<IconUser size={20} stroke={1.5} />}
              {...form.getInputProps('name')}
            />
          )}
          {method === 'email' && (
            <TextInput
              name="email"
              label="邮箱"
              variant="filled"
              placeholder="请输入你的邮箱"
              leftSection={<IconMail size={20} stroke={1.5} />}
              {...form.getInputProps('email')}
            />
          )}
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
            leftSection={<IconLock size={20} stroke={1.5} />}
            {...form.getInputProps('password')}
          />
          <Group justify="flex-end" mt="xl">
            <Button size="sm" variant="default" color="gray" onClick={() => navigate("/register")}>注册</Button>
            <Button size="sm" type="submit">登录</Button>
          </Group>
        </form>
        <PasskeyLogin />
      </Card>
    </Container>
  );
}