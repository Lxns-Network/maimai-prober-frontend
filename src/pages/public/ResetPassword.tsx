import { useEffect, useState } from "react";
import {
  Title,
  Text,
  Group,
  Button,
  LoadingOverlay,
  PasswordInput, Card
} from '@mantine/core';
import { Container } from '@mantine/core';
import { API_URL } from '../../main';
import { validatePassword } from "@/utils/validator.ts";
import { useNavigate } from "react-router-dom";
import { useForm } from "@mantine/form";
import { IconLock } from "@tabler/icons-react";
import classes from "../Form.module.css";
import { openRetryModal } from "../../utils/modal.tsx";

interface FormValues {
  password: string;
  confirm_password: string;
}

export default function ResetPassword() {
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();
  const token = new URLSearchParams(window.location.search).get("token");

  useEffect(() => {
    document.title = "重置密码 | maimai DX 查分器";

    if (!token) {
      navigate("/login");
    }
  }, [])

  const form = useForm<FormValues>({
    initialValues: {
      password: "",
      confirm_password: "",
    },

    validate: {
      password: (value) => validatePassword(value, { allowEmpty: false }),
      confirm_password: (value, values) => value === values.password ? null : "两次输入的密码不一致",
    },
  });

  const resetPasswordHandler = async (values: FormValues) => {
    setVisible(true);

    try {
      const res = await fetch(`${API_URL}/user/reset-password?token=${token}`, {
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
      navigate("/login", { state: { reset: true } })
    } catch (error) {
      openRetryModal("重置失败", `${error}`, () => resetPasswordHandler(values));
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
        <form onSubmit={form.onSubmit(resetPasswordHandler)}>
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
          <Group justify="flex-end" mt="xl">
            <Button size="sm" type="submit">重置密码</Button>
          </Group>
        </form>
      </Card>
    </Container>
  );
}