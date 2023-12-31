import {useEffect, useRef, useState} from "react";
import { Title, Card, TextInput, Text, Group, Anchor, Button, LoadingOverlay, Center, Box } from '@mantine/core';
import { Container, rem, createStyles } from '@mantine/core';
import { API_URL, TURNSTILE_SITE_KEY } from '../../main';
import { validateEmail } from "../../utils/validator";
import { useNavigate } from "react-router-dom";
import { useForm } from "@mantine/form";
import useAlert from '../../utils/useAlert';
import AlertModal from '../../components/AlertModal';
import { IconArrowLeft, IconMail } from "@tabler/icons-react";
import { Turnstile } from "@marsidev/react-turnstile";

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

export default function ForgotPassword() {
  const { isAlertVisible, alertTitle, alertContent, openAlert, closeAlert } = useAlert();
  const { classes } = useStyles();
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();
  const turnstileRef = useRef<any>()

  useEffect(() => {
    document.title = "忘记密码 | maimai DX 查分器";
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
      const res = await fetch(`${API_URL}/user/forgot-password?captcha=${turnstileRef.current?.getResponse()}`, {
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
        turnstileRef.current?.reset();
        return;
      }

      openAlert("发送成功", "请前往你的邮箱查看重置邮件。");
    } catch (error) {
      openAlert("发送失败", `${error}`);
    } finally {
      setVisible(false);
      turnstileRef.current?.reset();
    }
  }

  return (
    <Container className={classes.root} size={400}>
      <Turnstile
        ref={turnstileRef}
        options={{
          action: 'forgot-password',
          size: 'invisible',
        }}
        siteKey={TURNSTILE_SITE_KEY}
      />
      <AlertModal
        title={alertTitle}
        content={alertContent}
        opened={isAlertVisible}
        onClose={closeAlert}
      />
      <Title order={2} size="h2" weight={900} align="center">
        重置 maimai DX 查分器密码
      </Title>
      <Text color="dimmed" size="sm" align="center" mt="sm" mb="xl">
        重置你的 <span className={classes.highlight}>落雪咖啡屋</span> maimai DX 查分器账号密码
      </Text>
      <Card radius="md" shadow="md" p="xl" withBorder sx={(theme) => ({
        backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[8] : theme.white,
      })}>
        <LoadingOverlay visible={visible} overlayBlur={2} />
        <form onSubmit={form.onSubmit((values) => forgotPassword(values))}>
          <TextInput
            name="email"
            label="邮箱"
            variant="filled"
            placeholder="请输入你的邮箱"
            icon={<IconMail size={20} />}
            {...form.getInputProps('email')}
          />
          <Group position="apart" mt="xl">
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