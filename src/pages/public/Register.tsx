import {useEffect, useState} from "react";
import { Title, Card, PasswordInput, TextInput, Text, Group, Button, LoadingOverlay } from '@mantine/core';
import { Container, rem, createStyles } from '@mantine/core';
import { useInputState } from "@mantine/hooks";
import { useNavigate } from "react-router-dom";
import useAlert from '../../utils/useAlert';
import ReCaptcha from '../../utils/reCaptcha';
import AlertModal from "../../components/AlertModal";
import {API_URL, RECAPTCHA_SITE_KEY} from "../../main";
import Icon from "@mdi/react";
import { mdiAccountOutline, mdiEmailOutline, mdiLockOutline } from "@mdi/js";

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

export default function Register() {
  const { isAlertVisible, alertTitle, alertContent, openAlert, closeAlert } = useAlert();
  const { classes } = useStyles();
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();
  const recaptcha = new ReCaptcha(RECAPTCHA_SITE_KEY, "login");

  useEffect(() => {
    document.title = "注册 - maimai DX 查分器";

    recaptcha.render();

    return () => {
      recaptcha.destroy();
    }
  }, [])

  const [name, setNameValue] = useInputState('');
  const [email, setEmailValue] = useInputState('');
  const [password, setPasswordValue] = useInputState('');
  const [confirmPassword, setConfirmPasswordValue] = useInputState('');

  const validationRules = {
    name: "用户名不能为空",
    email: "邮箱不能为空",
    password: "密码不能为空",
    confirmPassword: "确认密码不能为空",
  };

  const validateInputs = (inputs: any) => {
    for (const [inputName, errorMessage] of Object.entries(validationRules)) {
      if (!inputs[inputName]) {
        openAlert("注册失败", errorMessage);
        return false;
      }
    }

    if (inputs.password !== inputs.confirmPassword) {
      openAlert("注册失败", "两次输入的密码不一致");
      return false;
    }

    return true;
  };

  const submitRegister = async () => {
    if (!validateInputs({
      name: name,
      email: email,
      password: password,
      confirmPassword: confirmPassword,
    })) {
      return;
    }
    if (password !== confirmPassword) {
      openAlert("注册失败", "两次输入的密码不一致");
      return;
    }
    setVisible(true);
    fetch(`${API_URL}/user/register?recaptcha=${await recaptcha.getToken()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        "name": name,
        "email": email,
        "password": password,
        "confirmPassword": confirmPassword,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        setVisible(false);
        if (data.success) {
          openAlert("注册成功", "请登录你的邮箱，根据指引完成账号激活。");
        } else {
          openAlert("注册失败", data.message);
        }
      })
      .catch((error) => {
        setVisible(false);
        openAlert("注册失败", error);
      });
  }

  return (
    <Container className={classes.root} size={400}>
      <AlertModal
        title={alertTitle}
        content={alertContent}
        opened={isAlertVisible}
        onClose={closeAlert}
        onConfirm={() => { if (alertTitle === "注册成功") navigate("/login") }}
      />
      <Title order={2} size="h2" weight={900} align="center">
        注册到 maimai DX 查分器
      </Title>
      <Text color="dimmed" size="sm" align="center" mt="sm" mb="xl">
        创建你的 <span className={classes.highlight}>落雪咖啡屋</span> maimai DX 查分器账号
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
          mb={4}
          icon={<Icon path={mdiAccountOutline} size={rem(16)} />}
          value={name}
          onChange={setNameValue}
        />
        <Text color="dimmed" size="xs" align="left" mb="sm">
          此用户名将会作为你的 maimai DX 查分器账号的唯一标识，且不会用作查分用途。
        </Text>
        <TextInput
          name="email"
          label="邮箱"
          variant="filled"
          placeholder="请输入你的邮箱"
          mb="sm"
          icon={<Icon path={mdiEmailOutline} size={rem(16)} />}
          value={email}
          onChange={setEmailValue}
        />
        <PasswordInput
          name="password"
          label="密码"
          variant="filled"
          placeholder="请输入你的密码"
          mb="sm"
          icon={<Icon path={mdiLockOutline} size={rem(16)} />}
          value={password}
          onChange={setPasswordValue}
        />
        <PasswordInput
          name="confirm-password"
          label="确认密码"
          variant="filled"
          placeholder="请再次输入你的密码"
          mb="sm"
          icon={<Icon path={mdiLockOutline} size={rem(16)} />}
          value={confirmPassword}
          onChange={setConfirmPasswordValue}
        />
        <Text color="dimmed" size="xs" align="left" mt="sm">
          注册即代表你同意我们的服务条款和隐私政策，请在注册后根据指引绑定你的游戏账号。
        </Text>
        <Group position="right" mt="sm">
          <Button size="sm" variant="default" color="gray" onClick={() => navigate("/login")}>
            登录
          </Button>
          <Button size="sm" onClick={submitRegister}>注册</Button>
        </Group>
      </Card>
    </Container>
  );
}