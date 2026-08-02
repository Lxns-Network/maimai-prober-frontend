import { useForm } from "@mantine/form";
import { validateText, validateUrl, validateRedirectUri } from "@/utils/validator.ts";
import { openAlertModal, openRetryModal } from "@/utils/modal.tsx";
import {
  Accordion,
  Alert,
  Avatar,
  Badge,
  Box,
  Button,
  Checkbox,
  Group,
  HoverCard,
  Modal,
  SimpleGrid,
  Switch,
  TagsInput,
  Text,
  Textarea,
  TextInput,
  ThemeIcon,
  useComputedColorScheme,
} from "@mantine/core";
import { EditAvatarButton } from "@/components/EditAvatarButton.tsx";
import { useFileDialog } from "@mantine/hooks";
import {
  useCreateOAuthApp,
  useEditOAuthApp,
  useUploadOAuthAppLogo,
} from "@/hooks/mutations/useDeveloperMutations.ts";
import { IconAlertCircle, IconHelp } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { OAuthAppProps } from "@/types/developer";
import { scopeData, scopeGroups } from "@/data/scopeData.tsx";

interface FormValues {
  name: string;
  description: string;
  website: string;
  logo_url?: string;
  redirect_uris: string[];
  scope?: string;
  scopes?: string[];
}

interface CreateOAuthClientModalProps {
  app: OAuthAppProps | null;
  opened: boolean;
  onClose(): void;
}

const MAX_REDIRECT_URIS = 10;
const MAX_REDIRECT_URI_LENGTH = 2048;

export const CreateOAuthClientModal = ({ app, opened, onClose }: CreateOAuthClientModalProps) => {
  const [oobChecked, setOobChecked] = useState(false);
  const form = useForm<FormValues>({
    initialValues: {
      name: "",
      description: "",
      website: "",
      redirect_uris: [],
      scopes: [],
    },

    validate: {
      name: (value) =>
        validateText(value, {
          allowEmpty: false,
          textLabel: "应用名称",
          minLength: 4,
          maxLength: 16,
        }),
      description: (value) => validateText(value, { allowEmpty: true, textLabel: "应用描述" }),
      website: (value) => validateUrl(value, { allowEmpty: true, urlLabel: "应用网站" }),
      redirect_uris: (values) => {
        if (values.length === 0) return "至少添加一个回调地址";
        if (values.length > MAX_REDIRECT_URIS) return `最多添加 ${MAX_REDIRECT_URIS} 个回调地址`;
        for (const value of values) {
          if (value.length > MAX_REDIRECT_URI_LENGTH)
            return `单个回调地址不能超过 ${MAX_REDIRECT_URI_LENGTH} 个字符`;
          const error = validateRedirectUri(value);
          if (error) return error;
        }
        if (new Set(values).size !== values.length) return "回调地址不能重复";
        return null;
      },
      scopes: (value) => {
        if (!value || value.length === 0) return "至少选择一个权限范围";
        if ((value.includes("profile") || value.includes("email")) && !value.includes("openid")) {
          return "用户资料和邮箱权限需要同时选择验证用户身份";
        }
        return null;
      },
    },

    transformValues: (values) => ({
      name: values.name,
      description: values.description,
      website: values.website,
      logo_url: values.logo_url || "",
      redirect_uris: values.redirect_uris,
      scope: values.scopes?.join(" ") || "",
    }),
  });

  const uploadOAuthAppLogoMutation = useUploadOAuthAppLogo();
  const createOAuthAppMutation = useCreateOAuthApp();
  const editOAuthAppMutation = useEditOAuthApp();

  const fileDialog = useFileDialog({
    multiple: false,
    accept: "image/*",
    onChange: (files) => {
      if (!files || files.length === 0) return;
      logoUploadHandler(files[0]);
    },
  });
  const computedColorScheme = useComputedColorScheme("light");

  const logoUploadHandler = (file: File) => {
    uploadOAuthAppLogoMutation.mutate(file, {
      onSuccess: (data) => {
        form.setFieldValue("logo_url", data.logo_url);
      },
      onError: (err) => {
        openAlertModal("上传失败", `${err}`);
      },
    });
  };

  const createOAuthClientHandler = (values: FormValues) => {
    createOAuthAppMutation.mutate(values, {
      onSuccess: () => {
        onClose();
      },
      onError: (err) => {
        openRetryModal("创建失败", `${err}`, () => createOAuthClientHandler(values));
      },
    });
  };

  const editOAuthClientHandler = (values: FormValues) => {
    if (!app || !app.client_id) return;
    editOAuthAppMutation.mutate(
      { clientId: app.client_id, data: values },
      {
        onSuccess: () => {
          onClose();
        },
        onError: (err) => {
          openRetryModal("编辑失败", `${err}`, () => createOAuthClientHandler(values));
        },
      },
    );
  };

  useEffect(() => {
    if (app) {
      form.setFieldValue("name", app.name);
      form.setFieldValue("description", app.description || "");
      form.setFieldValue("website", app.website || "");
      form.setFieldValue("logo_url", app.logo_url || "");
      const redirectUris = app.redirect_uris?.length
        ? app.redirect_uris
        : app.redirect_uri
          ? [app.redirect_uri]
          : [];
      form.setFieldValue("redirect_uris", redirectUris);
      form.setFieldValue("scopes", app.scope ? app.scope.split(" ") : []);
      setOobChecked(redirectUris.length === 1 && redirectUris[0] === "urn:ietf:wg:oauth:2.0:oob");
    } else {
      form.reset();
      setOobChecked(false);
    }
  }, [app, opened]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      onExitTransitionEnd={form.reset}
      title={!app ? "创建 OAuth 应用" : "编辑 OAuth 应用"}
      size="lg"
      centered
    >
      <form
        onSubmit={form.onSubmit((values) => {
          if (!app) {
            createOAuthClientHandler(values);
          } else {
            editOAuthClientHandler(values);
          }
        })}
      >
        <Box mb="xs">
          <Text size="sm">应用图标</Text>
          <EditAvatarButton onClick={fileDialog.open}>
            <Avatar
              src={form.values.logo_url || undefined}
              size={94}
              radius="md"
              styles={(theme) => ({
                root: {
                  backgroundColor:
                    computedColorScheme === "dark" ? theme.colors.dark[8] : theme.colors.gray[1],
                },
              })}
            >
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
        <TagsInput
          label="回调地址"
          description="OAuth 授权成功后，用户将被重定向到请求中指定的已注册地址"
          placeholder="https://example.com/callback"
          mb="xs"
          withAsterisk
          disabled={oobChecked}
          maxTags={MAX_REDIRECT_URIS}
          splitChars={[",", " "]}
          clearable
          {...form.getInputProps("redirect_uris")}
        />
        <Group gap="xs" align="center" mb="xs">
          <Checkbox
            label="无回调地址"
            checked={oobChecked}
            onChange={(event) => {
              setOobChecked(event.currentTarget.checked);
              form.setFieldValue(
                "redirect_uris",
                event.currentTarget.checked ? ["urn:ietf:wg:oauth:2.0:oob"] : [],
              );
            }}
          />
          <HoverCard width={280} shadow="md" withArrow>
            <HoverCard.Target>
              <ThemeIcon variant="subtle" color="gray" size="xs" style={{ cursor: "pointer" }}>
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
          onChange={(scopes) => {
            form.setFieldValue(
              "scopes",
              scopes.includes("openid")
                ? scopes
                : scopes.filter((scope) => scope !== "profile" && scope !== "email"),
            );
          }}
        >
          <Accordion multiple variant="contained" mt="xs">
            {scopeGroups.map((group) => {
              const selectedCount = group.scopes.filter((scope) =>
                form.values.scopes?.includes(scope),
              ).length;

              return (
                <Accordion.Item key={group.key} value={group.key}>
                  <Accordion.Control>
                    <Group justify="space-between" wrap="nowrap" pr="xs">
                      <Box>
                        <Text size="sm" fw={500}>
                          {group.title}{" "}
                          <Text component="span" inherit c="dimmed" fw={400}>
                            · {group.protocol}
                          </Text>
                        </Text>
                        <Text size="xs" c="dimmed" mt={2}>
                          {group.description}
                        </Text>
                      </Box>
                      {selectedCount > 0 && (
                        <Badge variant="light" size="sm" style={{ flexShrink: 0 }}>
                          已选 {selectedCount}
                        </Badge>
                      )}
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <SimpleGrid type="container" cols={{ base: 1, "440px": 2 }} spacing="sm">
                      {group.scopes.map((key) => (
                        <Switch
                          key={key}
                          value={key}
                          label={scopeData[key].title}
                          disabled={
                            (key === "profile" || key === "email") &&
                            !form.values.scopes?.includes("openid")
                          }
                        />
                      ))}
                    </SimpleGrid>
                  </Accordion.Panel>
                </Accordion.Item>
              );
            })}
          </Accordion>
        </Switch.Group>
        {form.values.scopes?.includes("read_user_token") && (
          <Alert variant="light" color="yellow" icon={<IconAlertCircle />} title="注意" mt="lg">
            我们已不再推荐使用个人 API 密钥，建议使用 OAuth 应用返回的访问令牌请求接口。
          </Alert>
        )}
        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={onClose}>
            取消
          </Button>
          <Button type="submit">{!app ? "创建" : "编辑"}</Button>
        </Group>
      </form>
    </Modal>
  );
};
