import { useEffect, useState } from "react";
import { Title, PasswordInput, TextInput, Text, Group, Button, LoadingOverlay, Card, Anchor } from '@mantine/core';
import { Container } from '@mantine/core';
import { useNavigate } from "react-router-dom";
import { API_URL, RECAPTCHA_SITE_KEY } from "@/main";
import { useForm } from "@mantine/form";
import { validateEmail, validatePassword, validateUserName } from "@/utils/validator.ts";
import { IconLock, IconMail, IconUser } from "@tabler/icons-react";
import ReCaptcha from "@/utils/reCaptcha.ts";
import classes from "../Form.module.css";
import { openConfirmModal, openRetryModal } from "@/utils/modal.tsx";

interface FormValues {
  name: string;
  email: string;
  password: string;
  confirm_password: string;
}

export default function Register() {
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();
  const recaptcha = new ReCaptcha(RECAPTCHA_SITE_KEY, "register");

  useEffect(() => {
    document.title = "注册 | maimai DX 查分器";

    recaptcha.render();

    return () => {
      recaptcha.destroy();
    }
  }, [])

  const form = useForm<FormValues>({
    initialValues: {
      name: "",
      email: "",
      password: "",
      confirm_password: "",
    },

    validate: {
      name: (value) => validateUserName(value, { allowEmpty: false }),
      email: (value) => validateEmail(value, { allowEmpty: false }),
      password: (value) => validatePassword(value, { allowEmpty: false }),
      confirm_password: (value, values) => value === values.password ? null : "两次输入的密码不一致",
    },
  });

  const registerHandler = async (values: FormValues) => {
    setVisible(true);

    try {
      const recaptchaToken = await recaptcha.getToken();
      const res = await fetch(`${API_URL}/user/register?captcha=${recaptchaToken}`, {
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
      openConfirmModal("注册成功", "请登录你的查分器账号，根据指引绑定你的游戏账号。", () => navigate("/login"));
    } catch (error) {
      openRetryModal("注册失败", `${error}`, () => registerHandler(values));
    } finally {
      setVisible(false);
    }
  }

  return (
    <Container className={classes.root} size={420}>
      <Title order={2} size="h2" fw={900} ta="center">
        注册到 maimai DX 查分器
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt="sm">
        创建你的 <span className={classes.highlight}>落雪咖啡屋</span> maimai DX 查分器账号
      </Text>
      <Card className={classes.card} withBorder shadow="md" p={30} mt={30} radius="md">
        <LoadingOverlay visible={visible} overlayProps={{ radius: "sm", blur: 2 }} zIndex={1} />
        <form onSubmit={form.onSubmit(registerHandler)}>
          <TextInput
            name="name"
            label="用户名"
            variant="filled"
            placeholder="请输入你的用户名"
            mb={4}
            leftSection={<IconUser size={20} stroke={1.5} />}
            {...form.getInputProps('name')}
          />
          <Text c="dimmed" size="xs" ta="left" mb="sm">
            此用户名将会作为你的 maimai DX 查分器账号的唯一标识，且不会用作查分用途。
          </Text>
          <TextInput
            name="email"
            label="邮箱"
            variant="filled"
            placeholder="请输入你的邮箱"
            mb="sm"
            leftSection={<IconMail size={20} stroke={1.5} />}
            {...form.getInputProps('email')}
          />
          <PasswordInput
            name="password"
            label="密码"
            variant="filled"
            placeholder="请输入你的密码"
            mb="sm"
            leftSection={<IconLock size={20} stroke={1.5} />}
            {...form.getInputProps('password')}
          />
          <PasswordInput
            name="confirm-password"
            label="确认密码"
            variant="filled"
            placeholder="请再次输入你的密码"
            mb="sm"
            leftSection={<IconLock size={20} stroke={1.5} />}
            {...form.getInputProps('confirm_password')}
          />
          <Text c="dimmed" size="xs" ta="left" mt="sm">
            注册即代表你同意我们的<Anchor href="/docs/terms-of-use">服务条款</Anchor>和<Anchor href="/docs/privacy-policy">隐私政策</Anchor>，请在注册后根据指引绑定你的游戏账号。
          </Text>
          <Group justify="flex-end" mt="sm">
            <Button size="sm" variant="default" color="gray" onClick={() => navigate("/login")}>
              登录
            </Button>
            <Button size="sm" type="submit">注册</Button>
          </Group>
        </form>
      </Card>
    </Container>
  );
}