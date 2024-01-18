import { useEffect, useState } from "react";
import {
  Title,
  Card,
  TextInput,
  Text,
  Group,
  Button,
  LoadingOverlay,
  Textarea
} from '@mantine/core';
import { Container, rem } from '@mantine/core';
import useAlert from '../../utils/useAlert';
import AlertModal from '../../components/AlertModal';
import Icon from "@mdi/react";
import {
  mdiCodeTags,
  mdiLink,
} from "@mdi/js";
import { useForm } from "@mantine/form";
import { getDeveloperApply, sendDeveloperApply } from "../../utils/api/developer";
import classes from "../Form.module.css";

export default function DeveloperApply() {
  const { isAlertVisible, alertTitle, alertContent, openAlert, closeAlert } = useAlert();
  const [applied, setApplied] = useState(false);
  const [visible, setVisible] = useState(false);

  const getDeveloperApplyHandler = async () => {
    try {
      const res = await getDeveloperApply();
      const data = await res.json();
      if (data.code === 200) {
        if (data.data) {
          if (data.data.api_key != null) {
            window.location.href = "/developer";
          }
          form.setValues(data.data);
          setApplied(true);
        }
      }
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    document.title = "申请成为开发者 | maimai DX 查分器";

    getDeveloperApplyHandler();
  }, [])

  const form = useForm({
    initialValues: {
      name: '',
      url: '',
      reason: '',
    },

    validate: {
      name: (value) => (value.length > 0 ? null : "项目名称不能为空"),
      url: (value) => (/^http(s)?:\/\/([\w-]+\.)+[\w-]+(\/[\w-./?%&=]*)?$/.test(value) ? null : "项目地址格式不正确"),
      reason: (value) => (value.length > 0 ? null : "申请理由不能为空"),
    },
  });

  const sendDeveloperApplyHandler = async (values: any) => {
    setVisible(true);
    try {
      const res = await sendDeveloperApply(values);
      const data = await res.json();
      if (!data.success) {
        openAlert("提交失败", data.message);
        return;
      }

      setApplied(true);
      openAlert("提交成功", "申请成功，我们将尽快审核您的申请");
    } catch (err) {
      openAlert("提交失败", `${err}`);
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
        申请成为开发者
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt="sm" mb="xl">
        提交申请，通过审核后即可获取 API 访问权限
      </Text>
      <Card className={classes.card} radius="md" shadow="md" p="xl" withBorder>
        <LoadingOverlay visible={visible} overlayProps={{ radius: "sm", blur: 2 }} />
        <form onSubmit={form.onSubmit((values) => sendDeveloperApplyHandler(values))}>
          <TextInput
            name="name"
            label="项目名称"
            variant="filled"
            placeholder="请输入你的项目名称"
            mb="sm"
            leftSection={<Icon path={mdiCodeTags} size={rem(16)} />}
            disabled={applied}
            {...form.getInputProps('name')}
          />
          <TextInput
            name="url"
            label="项目地址"
            variant="filled"
            placeholder="请输入你的项目地址"
            mb="sm"
            leftSection={<Icon path={mdiLink} size={rem(16)} />}
            disabled={applied}
            {...form.getInputProps('url')}
          />
          <Textarea
            name="reason"
            label="申请理由"
            variant="filled"
            placeholder="请输入你的申请理由"
            mb="sm"
            disabled={applied}
            {...form.getInputProps('reason')}
          />
          <Group justify="space-between" mt="xl">
            <div>
              {applied && (
                <Text size="xs" c="dimmed">你的申请正在受理中</Text>
              )}
            </div>
            <Button size="sm" type="submit" disabled={applied}>提交申请</Button>
          </Group>
        </form>
      </Card>
    </Container>
  );
}