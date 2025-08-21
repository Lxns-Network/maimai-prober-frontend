import { useEffect, useState } from "react";
import { Title, TextInput, Text, Group, Button, LoadingOverlay, Textarea, Card } from '@mantine/core';
import { Container, rem } from '@mantine/core';
import Icon from "@mdi/react";
import { mdiCodeTags, mdiLink } from "@mdi/js";
import { useForm } from "@mantine/form";
import { sendDeveloperApply } from "@/utils/api/developer.ts";
import classes from "../Form.module.css";
import { openAlertModal, openRetryModal } from "@/utils/modal.tsx";
import { useNavigate } from "react-router-dom";
import { validateText, validateUrl } from "@/utils/validator.ts";
import { useDeveloper } from "@/hooks/swr/useDeveloper.ts";

interface FormValues {
  name: string;
  url: string;
  reason: string;
}

export default function DeveloperApply() {
  const { developer, isLoading } = useDeveloper();
  const [submitting, setSubmitting] = useState(false);
  const [applied, setApplied] = useState(false);
  const navigate = useNavigate();

  const form = useForm<FormValues>({
    initialValues: {
      name: "",
      url: "",
      reason: "",
    },

    validate: {
      name: (value) => validateText(value, { allowEmpty: false, textLabel: "开发者名称" }),
      url: (value) => validateUrl(value, { allowEmpty: false, urlLabel: "开发者地址" }),
      reason: (value) => validateText(value, { allowEmpty: false, textLabel: "申请理由" }),
    },
  });

  const handleSubmit = async (values: FormValues) => {
    setSubmitting(true);

    try {
      const res = await sendDeveloperApply(values);
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      setApplied(true);
      openAlertModal("提交成功", "申请成功，我们将尽快审核您的申请。")
    } catch (error) {
      openRetryModal("提交失败", `${error}`, () => handleSubmit(values));
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    document.title = "申请成为开发者 | maimai DX 查分器";
  }, [])

  useEffect(() => {
    if (!developer) return;

    if (developer.api_key) {
      navigate("/developer", { replace: true });
    } else {
      form.setValues({
        name: developer.name || "",
        url: developer.url || "",
        reason: developer.reason || "",
      });
      setApplied(true);
    }
  }, [developer]);

  return (
    <Container className={classes.root} size={420}>
      <Title order={2} size="h2" fw={900} ta="center">
        申请成为开发者
      </Title>
      <Text c="dimmed" size="sm" ta="center" mt="sm">
        提交申请，通过审核后即可获取开发者 API 访问权限
      </Text>
      <Card className={classes.card} withBorder shadow="md" p={30} mt={30} radius="md">
        <LoadingOverlay visible={isLoading} overlayProps={{ radius: "sm", blur: 2 }} zIndex={2} />
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <TextInput
            name="name"
            label="开发者名称"
            variant="filled"
            placeholder="请输入你本人或组织的名称"
            mb="sm"
            leftSection={<Icon path={mdiCodeTags} size={rem(16)} />}
            disabled={applied}
            {...form.getInputProps('name')}
          />
          <TextInput
            name="url"
            label="开发者地址"
            variant="filled"
            placeholder="请输入你本人或组织的地址"
            mb={4}
            leftSection={<Icon path={mdiLink} size={rem(16)} />}
            disabled={applied}
            {...form.getInputProps('url')}
          />
          <Text c="dimmed" size="xs" ta="left" mb="sm">
            可以是个人主页、GitHub 主页或组织主页等
          </Text>
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
            <Button size="sm" type="submit" loading={submitting} disabled={applied}>提交申请</Button>
          </Group>
        </form>
      </Card>
    </Container>
  );
}