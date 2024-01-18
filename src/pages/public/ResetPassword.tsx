import { useEffect, useState } from "react";
import {
  Title,
  Card,
  Text,
  Group,
  Button,
  LoadingOverlay,
  PasswordInput
} from '@mantine/core';
import { Container } from '@mantine/core';
import { API_URL } from '../../main';
import { validatePassword } from "../../utils/validator";
import { useNavigate } from "react-router-dom";
import { useForm } from "@mantine/form";
import useAlert from '../../utils/useAlert';
import AlertModal from '../../components/AlertModal';
import { IconLock } from "@tabler/icons-react";
import classes from "../Form.module.css";

export default function ResetPassword() {
  const { isAlertVisible, alertTitle, alertContent, openAlert, closeAlert } = useAlert();
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();

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
      const res = await fetch(`${API_URL}/user/reset-password?token=${
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
        return
      }

      navigate("/login", { state: { reset: true } })
    } catch (error) {
      openAlert("重置失败", `${error}`);
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
          <PasswordInput
            name="password"
            label="密码"
            variant="filled"
            placeholder="请输入你的密码"
            mb="sm"
            leftSection={<IconLock size={20} />}
            {...form.getInputProps('password')}
          />
          <PasswordInput
            name="confirm-password"
            label="确认密码"
            variant="filled"
            placeholder="请再次输入你的密码"
            mb="sm"
            leftSection={<IconLock size={20} />}
            {...form.getInputProps('confirmPassword')}
          />
          <Group justify="flex-end" mt="xl">
            <Button size="sm" type="submit">重置密码</Button>
          </Group>
        </form>
      </Card>
    </Container>
  );
}