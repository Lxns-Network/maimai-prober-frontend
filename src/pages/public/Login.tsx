import {useEffect, useState} from "react";
import { Title, Card, PasswordInput, TextInput, Text, Group, Anchor, Button, LoadingOverlay } from '@mantine/core';
import { Container, rem, createStyles } from '@mantine/core';
import { useNavigate } from "react-router-dom";
import useAlert from '../../utils/useAlert';
import useFormInput from "../../utils/useFormInput";
import ReCaptcha from "../../utils/reCaptcha";
import Alert from '../../components/Alert';
import { API_URL, RECAPTCHA_SITE_KEY } from '../../main';
import Icon from "@mdi/react";
import { mdiAccountOutline, mdiLockOutline} from "@mdi/js";

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
  const navigate = useNavigate();
  const recaptcha = new ReCaptcha(RECAPTCHA_SITE_KEY, "login");

  useEffect(() => {
    recaptcha.render();

    return () => {
      recaptcha.destroy();
    }
  }, [])

  const nameInput = useFormInput('');
  const passwordInput = useFormInput('');

  const validationRules = {
    name: "用户名不能为空",
    password: "密码不能为空",
  };

  const validateInputs = (inputs: any) => {
    for (const [inputName, errorMessage] of Object.entries(validationRules)) {
      if (!inputs[inputName]) {
        openAlert("登录失败", errorMessage);
        return false;
      }
    }

    return true;
  };

  const submitLogin = async () => {
    if (!validateInputs({
      name: nameInput.value,
      password: passwordInput.value,
    })) {
      return;
    }
    setVisible(true);
    fetch(`${API_URL}/user/login?recaptcha=${await recaptcha.getToken()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        "name": nameInput.value,
        "password": passwordInput.value,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        setVisible(false);
        if (data.success) {
          localStorage.setItem("token", data.data.token);
          navigate("/")
        } else {
          openAlert("登录失败", data.message);
        }
      })
      .catch((error) => {
        setVisible(false);
        openAlert("登录失败", error);
      });
  };

  return (
    <Container className={classes.root} size={400}>
      <Alert
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
        <TextInput
          name="name"
          label="用户名"
          variant="filled"
          placeholder="请输入你的用户名"
          icon={<Icon path={mdiAccountOutline} size={rem(16)} />}
          {...nameInput}
        />
        <Group position="apart" mt="md">
          <Text component="label" htmlFor="password" size="sm" weight={500}>密码</Text>
          <Anchor<'a'> href="#" onClick={(event) => event.preventDefault()} sx={(theme) => ({
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
          icon={<Icon path={mdiLockOutline} size={rem(16)} />}
          {...passwordInput}
        />
        <Group position="right" mt="xl">
          <Button size="sm" variant="default" color="gray" onClick={() => navigate("/register")}>注册</Button>
          <Button size="sm" onClick={submitLogin}>登录</Button>
        </Group>
      </Card>
    </Container>
  );
}