import {useEffect, useRef, useState} from "react";
import {
  Title,
  Card,
  Text,
  Group,
  Button,
  LoadingOverlay,
  PasswordInput
} from '@mantine/core';
import { Container, rem, createStyles } from '@mantine/core';
import { API_URL, TURNSTILE_SITE_KEY } from '../../main';
import { validatePassword } from "../../utils/validator";
import { useNavigate } from "react-router-dom";
import { useForm } from "@mantine/form";
import useAlert from '../../utils/useAlert';
import AlertModal from '../../components/AlertModal';
import { IconLock } from "@tabler/icons-react";
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

export default function ResetPassword() {
  const { isAlertVisible, alertTitle, alertContent, openAlert, closeAlert } = useAlert();
  const { classes } = useStyles();
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();
  const turnstileRef = useRef<any>()

  useEffect(() => {
    document.title = "重置密码 | maimai DX 查分器";

    if (!new URLSearchParams(window.location.search).get("token")) {
      navigate("/login");
    }
  }, [])

  const form = useForm({
    initialValues: {
      password: '',
      confirmPassword: '',
    },

    validate: {
      password: (value) => (validatePassword(value) ? null : "密码格式不正确"),
      confirmPassword: (value, values) => (value === values.password ? null : "两次输入的密码不一致"),
    },
  });

  const forgotPassword = async (values: any) => {
    setVisible(true);
    try {
      const res = await fetch(`${API_URL}/user/reset-password?captcha=${turnstileRef.current?.getResponse()}&token=${
        new URLSearchParams(window.location.search).get("token")
      }`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!data.success) {
        openAlert("重置失败", data.message);
        turnstileRef.current?.reset();
        return
      }

      navigate("/login", { state: { reset: true } })
    } catch (error) {
      openAlert("重置失败", `${error}`);
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
          action: 'reset-password',
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
          <PasswordInput
            name="password"
            label="密码"
            variant="filled"
            placeholder="请输入你的密码"
            mb="sm"
            icon={<IconLock size={20} />}
            {...form.getInputProps('password')}
          />
          <PasswordInput
            name="confirm-password"
            label="确认密码"
            variant="filled"
            placeholder="请再次输入你的密码"
            mb="sm"
            icon={<IconLock size={20} />}
            {...form.getInputProps('confirmPassword')}
          />
          <Group position="right" mt="xl">
            <Button size="sm" type="submit">重置密码</Button>
          </Group>
        </form>
      </Card>
    </Container>
  );
}