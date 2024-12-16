import { useEffect, useState } from "react";
import { Title, TextInput, Text, Group, Anchor, Button, LoadingOverlay, Center, Box, Card } from '@mantine/core';
import { Container } from '@mantine/core';
import { API_URL, RECAPTCHA_SITE_KEY } from '@/main';
import { validateEmail } from "@/utils/validator.ts";
import { Link } from "react-router-dom";
import { useForm } from "@mantine/form";
import { IconArrowLeft, IconMail } from "@tabler/icons-react";
import ReCaptcha from "@/utils/reCaptcha.ts";
import classes from "../Form.module.css";
import { openAlertModal, openRetryModal } from "@/utils/modal.tsx";

export default function ForgotPassword() {
  const [visible, setVisible] = useState(false);
  const recaptcha = new ReCaptcha(RECAPTCHA_SITE_KEY, "forgot");

  useEffect(() => {
    document.title = "忘记密码－maimai DX 查分器";

    recaptcha.render();

    return () => {
      recaptcha.destroy();
    }
  }, [])

  const form = useForm({
    initialValues: {
      email: '',
    },

    validate: {
      email: (value) => (validateEmail(value) ? null : "邮箱格式不正确"),
    },
  });

  const forgotPassword = async (values: any) => {
    setVisible(true);
    try {
      const recaptchaToken = await recaptcha.getToken();
      const res = await fetch(`${API_URL}/user/forgot-password?captcha=${recaptchaToken}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });
      if (res.status === 404) {
        openAlertModal("发送失败", "该邮箱未注册过 maimai DX 查分器账号。");
        return;
      }
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      openAlertModal("发送成功", "请前往你的邮箱查看重置邮件。");
    } catch (error) {
      openRetryModal("发送失败", `${error}`, () => forgotPassword(values));
    } finally {
      setVisible(false);
    }
  }

  return (
    <Container className={classes.root} size={420}>
      <Title order={2} size="h2" fw={900} ta="center">
        重置 maimai DX 查分器密码
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt="sm">
        重置你的 <span className={classes.highlight}>落雪咖啡屋</span> maimai DX 查分器账号密码
      </Text>
      <Card className={classes.card} withBorder shadow="md" p={30} mt={30} radius="md">
        <LoadingOverlay visible={visible} overlayProps={{ radius: "sm", blur: 2 }} zIndex={1} />
        <form onSubmit={form.onSubmit((values) => forgotPassword(values))}>
          <TextInput
            name="email"
            label="邮箱"
            variant="filled"
            placeholder="请输入你的邮箱"
            leftSection={<IconMail size={20} stroke={1.5} />}
            {...form.getInputProps('email')}
          />
          <Group justify="space-between" mt="xl">
            <Anchor c="dimmed" size="sm" component={Link} to="/login">
              <Center inline>
                <IconArrowLeft size={18} />
                <Box component="span" ml={5}>
                  返回登录页面
                </Box>
              </Center>
            </Anchor>
            <Button size="sm" type="submit">发送重置邮件</Button>
          </Group>
        </form>
      </Card>
    </Container>
  );
}