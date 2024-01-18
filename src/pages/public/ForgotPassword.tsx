import { useEffect, useState } from "react";
import {
  Title,
  Card,
  TextInput,
  Text,
  Group,
  Anchor,
  Button,
  LoadingOverlay,
  Center,
  Box
} from '@mantine/core';
import { Container } from '@mantine/core';
import { API_URL, RECAPTCHA_SITE_KEY } from '../../main';
import { validateEmail } from "../../utils/validator";
import { useNavigate } from "react-router-dom";
import { useForm } from "@mantine/form";
import useAlert from '../../utils/useAlert';
import AlertModal from '../../components/AlertModal';
import { IconArrowLeft, IconMail } from "@tabler/icons-react";
import ReCaptcha from "../../utils/reCaptcha.tsx";
import classes from "../Form.module.css";

export default function ForgotPassword() {
  const { isAlertVisible, alertTitle, alertContent, openAlert, closeAlert } = useAlert();
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();
  const recaptcha = new ReCaptcha(RECAPTCHA_SITE_KEY, "forgot");

  useEffect(() => {
    document.title = "忘记密码 | maimai DX 查分器";

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
        openAlert("发送失败", "该邮箱未注册过 maimai DX 查分器账号。");
        return;
      }
      const data = await res.json();
      if (!data.success) {
        openAlert("发送失败", data.message);
        return;
      }

      openAlert("发送成功", "请前往你的邮箱查看重置邮件。");
    } catch (error) {
      openAlert("发送失败", `${error}`);
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
      <Title order={2} size="h2" fw={900} ta="center">
        重置 maimai DX 查分器密码
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt="sm" mb="xl">
        重置你的 <span className={classes.highlight}>落雪咖啡屋</span> maimai DX 查分器账号密码
      </Text>
      <Card className={classes.card} radius="md" shadow="md" p="xl" withBorder>
        <LoadingOverlay visible={visible} overlayProps={{ radius: "sm", blur: 2 }} />
        <form onSubmit={form.onSubmit((values) => forgotPassword(values))}>
          <TextInput
            name="email"
            label="邮箱"
            variant="filled"
            placeholder="请输入你的邮箱"
            leftSection={<IconMail size={20} />}
            {...form.getInputProps('email')}
          />
          <Group justify="space-between" mt="xl">
            <Anchor c="dimmed" size="sm" onClick={() => navigate("/login")}>
              <Center>
                <IconArrowLeft size={20} />
                <Box ml={8}>返回登录页面</Box>
              </Center>
            </Anchor>
            <Button size="sm" type="submit">发送重置邮件</Button>
          </Group>
        </form>
      </Card>
    </Container>
  );
}