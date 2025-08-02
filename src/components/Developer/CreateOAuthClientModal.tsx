import { useForm } from "@mantine/form";
import { validateText, validateUrl, validateRedirectUri } from "@/utils/validator.ts";
import { openAlertModal, openRetryModal } from "@/utils/modal.tsx";
import {
  Avatar, Box, Button, Checkbox, Group, HoverCard, Modal, SimpleGrid, Switch, Text, Textarea, TextInput, ThemeIcon,
  useComputedColorScheme
} from "@mantine/core";
import { EditAvatarButton } from "@/components/EditAvatarButton.tsx";
import { useFileDialog } from "@mantine/hooks";
import { createOAuthApp, editOAuthApp, uploadOAuthAppLogo } from "@/utils/api/developer.ts";
import { IconHelp } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { OAuthAppProps } from "@/types/developer";
import { scopeData } from "@/data/scopeData.tsx";

interface FormValues {
  name: string;
  description: string;
  website: string;
  logo_url?: string;
  redirect_uri: string;
  scope?: string;
  scopes?: string[];
}

interface CreateOAuthClientModalProps {
  app: OAuthAppProps | null;
  opened: boolean;
  onClose(): void;
}

export const CreateOAuthClientModal = ({ app, opened, onClose }: CreateOAuthClientModalProps) => {
  const [oobChecked, setOobChecked] = useState(false);
  const form = useForm<FormValues>({
    initialValues: {
      name: "",
      description: "",
      website: "",
      redirect_uri: "",
      scopes: [],
    },

    validate: {
      name: (value) => validateText(value, { allowEmpty: false, textLabel: "应用名称", minLength: 4, maxLength: 16 }),
      description: (value) => validateText(value, { allowEmpty: true, textLabel: "应用描述" }),
      website: (value) => validateUrl(value, { allowEmpty: true, urlLabel: "应用网站" }),
      redirect_uri: (value) => validateRedirectUri(value),
      scopes: (value) => {
        if (!value || value.length === 0) return "至少选择一个权限范围";
        return null;
      },
    },

    transformValues: (values) => ({
      name: values.name,
      description: values.description,
      website: values.website,
      logo_url: values.logo_url || "",
      redirect_uri: values.redirect_uri,
      scope: values.scopes?.join(" ") || "",
    }),
  });

  const fileDialog = useFileDialog({
    multiple: false,
    accept: 'image/*',
    onChange: (files) => {
      if (!files || files.length === 0) return;
      logoUploadHandler(files[0]);
    }
  });
  const computedColorScheme = useComputedColorScheme('light');

  const logoUploadHandler = async (file: File) => {
    try {
      const res = await uploadOAuthAppLogo(file);
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      form.setFieldValue("logo_url", data.data.logo_url);
    } catch (err) {
      openAlertModal("上传失败", `${err}`);
    }
  }

  const createOAuthClientHandler = async (values: FormValues) => {
    try {
      const res = await createOAuthApp(values);
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      onClose();
    } catch (err) {
      openRetryModal("创建失败", `${err}`, () => createOAuthClientHandler(values));
    }
  }

  const editOAuthClientHandler = async (values: FormValues) => {
    if (!app || !app.client_id) return;
    try {
      const res = await editOAuthApp(app.client_id, values);
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      onClose();
    } catch (err) {
      openRetryModal("编辑失败", `${err}`, () => createOAuthClientHandler(values));
    }
  }

  useEffect(() => {
    if (app) {
      form.setFieldValue("name", app.name);
      form.setFieldValue("description", app.description || "");
      form.setFieldValue("website", app.website || "");
      form.setFieldValue("logo_url", app.logo_url || "");
      form.setFieldValue("redirect_uri", app.redirect_uri || "");
      form.setFieldValue("scopes", app.scope ? app.scope.split(" ") : []);
      setOobChecked(app.redirect_uri === "urn:ietf:wg:oauth:2.0:oob");
    } else {
      form.reset();
      setOobChecked(false);
    }
  }, [app, opened]);

  return (
    <Modal opened={opened} onClose={onClose} onExitTransitionEnd={form.reset} title={!app ? "创建 OAuth 应用" : "编辑 OAuth 应用"} centered>
      <form onSubmit={form.onSubmit((values) => {
        if (!app) {
          createOAuthClientHandler(values);
        } else {
          editOAuthClientHandler(values);
        }
      })}>
        <Box mb="xs">
          <Text size="sm">应用图标</Text>
          <EditAvatarButton onClick={fileDialog.open}>
            <Avatar src={form.values.logo_url || undefined} size={94} radius="md" styles={(theme) => ({
              root: {
                backgroundColor: computedColorScheme === 'dark' ? theme.colors.dark[8] : theme.colors.gray[1],
              }
            })}>
              <Text fz="xs">请选择图片</Text>
            </Avatar>
          </EditAvatarButton>
        </Box>
        <Group align="start" grow mb="xs">
          <TextInput
            label="应用名称"
            placeholder="请输入应用名称"
            withAsterisk
            {...form.getInputProps("name")}
          />
          <TextInput
            label="应用网站"
            placeholder="请输入应用网站"
            {...form.getInputProps("website")}
          />
        </Group>
        <Textarea
          label="应用描述"
          placeholder="请输入应用描述"
          mb="xs"
          {...form.getInputProps("description")}
        />
        <TextInput
          label="回调地址"
          description="OAuth 授权成功后，用户将被重定向到此地址"
          placeholder="请输入应用回调地址"
          mb="xs"
          withAsterisk
          {...form.getInputProps("redirect_uri")}
        />
        <Group gap="xs" mb="xs">
          <Checkbox
            label="无回调地址"
            checked={oobChecked}
            onChange={(event) => {
              setOobChecked(event.currentTarget.checked);
              form.setFieldValue("redirect_uri", event.currentTarget.checked ? "urn:ietf:wg:oauth:2.0:oob" : "");
            }}
          />
          <HoverCard width={280} shadow="md">
            <HoverCard.Target>
              <ThemeIcon variant="subtle" color="gray" size="sm">
                <IconHelp />
              </ThemeIcon>
            </HoverCard.Target>
            <HoverCard.Dropdown>
              <Text size="sm">
                如果应用没有回调地址，可以使用此选项。用户授权后将会显示授权码。
              </Text>
            </HoverCard.Dropdown>
          </HoverCard>
        </Group>
        <Switch.Group
          label="应用权限范围"
          description="选择应用需要的权限范围，用户在授权时会看到这些权限"
          withAsterisk
          {...form.getInputProps("scopes")}
        >
          <SimpleGrid type="container" cols={{ base: 1, "350px": 2 }} spacing="xs" mt="xs">
            {Object.entries(scopeData).map(([key, value]) => (
              <Switch key={key} value={key} label={value.title} />
            ))}
          </SimpleGrid>
        </Switch.Group>
        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={onClose}>取消</Button>
          <Button color="blue" type="submit">{!app ? "创建" : "编辑"}</Button>
        </Group>
      </form>
    </Modal>
  )
}