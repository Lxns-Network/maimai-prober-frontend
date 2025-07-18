import { useEffect, useState } from "react";
import { Title, TextInput, Text, Group, Button, LoadingOverlay, Textarea, Card } from '@mantine/core';
import { Container, rem } from '@mantine/core';
import Icon from "@mdi/react";
import { mdiCodeTags, mdiLink } from "@mdi/js";
import { useForm } from "@mantine/form";
import { getDeveloperApply, sendDeveloperApply } from "@/utils/api/developer.ts";
import classes from "../Form.module.css";
import { openAlertModal, openRetryModal } from "@/utils/modal.tsx";
import { useNavigate } from "react-router-dom";

interface FormValues {
  name: string;
  url: string;
  reason: string;
}

export default function DeveloperApply() {
  const [applied, setApplied] = useState(false);
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();

  const getDeveloperApplyHandler = async () => {
    try {
      const res = await getDeveloperApply();
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      if (data.data) {
        if (data.data.api_key) {
          navigate("/developer", { replace: true });
        }
        form.setValues(data.data);
        setApplied(true);
      }
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    document.title = "申请成为开发者 | maimai DX 查分器";

    getDeveloperApplyHandler();
  }, [])

  const form = useForm<FormValues>({
    initialValues: {
      name: "",
      url: "",
      reason: "",
    },

    validate: {
      name: (value) => (value.length > 0 ? null : "项目名称不能为空"),
      url: (value) => (/^http(s)?:\/\/([\w-]+\.)+[\w-]+(\/[\w-./?%&=]*)?$/.test(value) ? null : "项目地址格式不正确"),
      reason: (value) => (value.length > 0 ? null : "申请理由不能为空"),
    },
  });

  const sendDeveloperApplyHandler = async (values: FormValues) => {
    setVisible(true);

    try {
      const res = await sendDeveloperApply(values);
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      setApplied(true);
      openAlertModal("提交成功", "申请成功，我们将尽快审核您的申请。")
    } catch (error) {
      openRetryModal("提交失败", `${error}`, () => sendDeveloperApplyHandler(values));
    } finally {
      setVisible(false);
    }
  }

  return (
    <Container className={classes.root} size={420}>
      <Title order={2} size="h2" fw={900} ta="center">
        申请成为开发者
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt="sm">
        提交申请，通过审核后即可获取 API 访问权限
      </Text>
      <Card className={classes.card} withBorder shadow="md" p={30} mt={30} radius="md">
        <LoadingOverlay visible={visible} overlayProps={{ radius: "sm", blur: 2 }} zIndex={1} />
        <form onSubmit={form.onSubmit(sendDeveloperApplyHandler)}>
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