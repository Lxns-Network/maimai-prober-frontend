import { useEffect } from "react";
import { useForm } from "@mantine/form";
import {
  Button,
  Checkbox,
  Chip,
  Group,
  HoverCard,
  Input,
  Modal,
  MultiSelect,
  ScrollArea,
  Select,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
} from "@mantine/core";
import { DatesProvider, DateTimePicker } from "@mantine/dates";
import { useFileDialog } from "@mantine/hooks";
import { useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Link, RichTextEditor } from "@mantine/tiptap";
import { Image } from "@tiptap/extension-image";
import { Highlight } from "@tiptap/extension-highlight";
import { TextAlign } from "@tiptap/extension-text-align";
import { IconHelp, IconPhoto } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import { useBackDismiss } from "@/hooks/useBackDismiss.ts";
import { openAlertModal, openRetryModal } from "@/utils/modal.tsx";
import {
  usePublishNotification,
  useUpdateNotification,
  useUploadNotificationImage,
} from "@/hooks/mutations/useAdminNotificationMutations.ts";
import { AdminBroadcast, PublishNotificationPayload } from "@/types/notification";
import { listToPermission, permissionToList, UserPermission } from "@/utils/session.ts";
import { getNotificationTypeIcon } from "@/components/Notifications/notificationIcons.ts";
import { match, P } from "ts-pattern";

const PERMISSION_OPTIONS = [
  { label: "普通用户", value: UserPermission.User.toString() },
  { label: "开发者", value: UserPermission.Developer.toString() },
  { label: "管理员", value: UserPermission.Administrator.toString() },
];

const TYPE_OPTIONS = [
  { value: "general", label: "普通" },
  { value: "maintenance", label: "维护" },
  { value: "version", label: "版本更新" },
  { value: "event", label: "活动" },
  { value: "developer", label: "开发者" },
];

interface FormValues {
  title: string;
  level: PublishNotificationPayload["level"];
  type: string;
  expire: string | null;
  audience: PublishNotificationPayload["audience"];
  persistent: boolean;
}

export function PublishNotificationModal({
  opened,
  onClose,
  editing,
  lockedUserIds,
}: {
  opened: boolean;
  onClose: () => void;
  editing?: AdminBroadcast;
  // 由用户列表「发送通知」传入：受众锁定为这些用户，Modal 内不再选择受众。
  lockedUserIds?: number[];
}) {
  useBackDismiss(opened, onClose);
  const { mutate: publish } = usePublishNotification();
  const { mutate: update } = useUpdateNotification();

  const form = useForm<FormValues>({
    initialValues: {
      title: "",
      level: "normal",
      type: "general",
      expire: null,
      audience: { type: "all" },
      persistent: false,
    },
    validate: { title: (v) => (v.trim() === "" ? "标题不能为空" : null) },
  });

  const editor = useEditor({
    // TipTap 3 的 StarterKit 内置 underline 与 link；link 关掉改用 Mantine 的 Link。
    extensions: [
      StarterKit.configure({ link: false }),
      Link,
      Image.configure({ HTMLAttributes: { style: "max-width: 100%;" } }),
      Highlight,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: "",
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
  });

  const { mutate: uploadImage } = useUploadNotificationImage();
  const imageDialog = useFileDialog({
    multiple: false,
    accept: "image/*",
    resetOnOpen: true,
    onChange: (files) => {
      const file = files?.[0];
      if (!file) return;
      uploadImage(file, {
        onSuccess: (data) => editor?.chain().focus().setImage({ src: data.url }).run(),
        onError: (err) => openAlertModal("上传失败", `${err}`),
      });
    },
  });

  // 编辑模式：回填表单 + 编辑器
  useEffect(() => {
    if (!opened) return;
    if (editing) {
      form.setValues({
        title: editing.title,
        level: editing.level,
        type: editing.type,
        expire: editing.expire_time ?? null,
        // 受众发布后不可变（后端 PUT 忽略 audience）；这里按原类型回填，避免 users 类型被回填成 all。
        audience:
          editing.audience_type === "permission"
            ? { type: "permission", permission: editing.audience_permission }
            : editing.audience_type === "users"
              ? { type: "users", user_ids: [] }
              : { type: "all" },
        persistent: editing.persistent,
      });
      editor?.commands.setContent(editing.content || "");
    } else {
      form.reset();
      if (lockedUserIds) {
        form.setFieldValue("audience", { type: "users", user_ids: lockedUserIds });
      }
      editor?.commands.clearContent();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, editing, editor, lockedUserIds]);

  const submit = (values: FormValues) => {
    if (!editor || editor.isEmpty) {
      openAlertModal("正文不能为空", "请填写通知正文。");
      return;
    }
    const content = editor.getHTML();
    if (!editing && values.audience.type === "permission" && !values.audience.permission) {
      openAlertModal("请选择权限", "指定权限受众需要至少选择一个权限。");
      return;
    }

    const payload: PublishNotificationPayload = {
      title: values.title,
      content,
      type: values.type,
      level: values.level,
      audience: values.audience,
      persistent: values.persistent,
      expire_time: values.expire ? dayjs(values.expire).toISOString() : undefined,
    };

    // 仅成功后关闭 Modal；失败时保留弹窗与已填内容，由 onError 的重试入口处理。
    const onError = (err: unknown) => openRetryModal("提交失败", `${err}`, () => submit(values));
    if (editing) {
      update({ id: editing.id, payload }, { onError, onSuccess: onClose });
    } else {
      publish(payload, { onError, onSuccess: onClose });
    }
  };

  const SelectedTypeIcon = getNotificationTypeIcon(form.values.type);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={editing ? "编辑通知" : "发送通知"}
      size="lg"
      centered
    >
      <form onSubmit={form.onSubmit(submit)}>
        <TextInput label="标题" placeholder="请输入标题" mb="xs" {...form.getInputProps("title")} />
        <Input.Wrapper label="级别" mb="xs">
          <Chip.Group {...form.getInputProps("level")}>
            <Group gap="xs">
              <Chip size="xs" value="normal">
                普通
              </Chip>
              <Chip size="xs" value="important" color="yellow">
                重要
              </Chip>
              <Chip size="xs" value="urgent" color="red">
                紧急
              </Chip>
            </Group>
          </Chip.Group>
        </Input.Wrapper>
        <Group grow align="flex-start" mb="xs">
          <Select
            label="类型"
            data={TYPE_OPTIONS}
            allowDeselect={false}
            leftSection={<SelectedTypeIcon size={18} />}
            renderOption={({ option }) => {
              const OptIcon = getNotificationTypeIcon(option.value);
              return (
                <Group gap="xs">
                  <OptIcon size={18} />
                  <span>{option.label}</span>
                </Group>
              );
            }}
            comboboxProps={{
              transitionProps: { transition: "fade", duration: 100, timingFunction: "ease" },
            }}
            {...form.getInputProps("type")}
          />
          {match({ editing, lockedUserIds })
            .with({ editing: P.nullish, lockedUserIds: P.array() }, ({ lockedUserIds }) => (
              <TextInput
                label="接收对象"
                value={`指定用户（${lockedUserIds.length} 人）`}
                disabled
              />
            ))
            .with({ editing: { audience_type: "users" } }, () => (
              <TextInput label="接收对象" value="指定用户" disabled />
            ))
            .otherwise(() => {
              const { audience } = form.values;
              return (
                <Stack gap="xs">
                  <Select
                    label="接收对象"
                    data={[
                      { value: "all", label: "全体用户" },
                      { value: "permission", label: "指定权限" },
                    ]}
                    value={audience.type === "permission" ? "permission" : "all"}
                    allowDeselect={false}
                    disabled={!!editing}
                    onChange={(v) =>
                      form.setFieldValue(
                        "audience",
                        v === "permission"
                          ? { type: "permission", permission: 0 }
                          : { type: "all" },
                      )
                    }
                    comboboxProps={{
                      transitionProps: {
                        transition: "fade",
                        duration: 100,
                        timingFunction: "ease",
                      },
                    }}
                  />
                  {audience.type === "permission" && (
                    <MultiSelect
                      label="权限"
                      placeholder="选择权限"
                      data={PERMISSION_OPTIONS}
                      value={permissionToList(audience.permission ?? 0).map(String)}
                      disabled={!!editing}
                      onChange={(vals) =>
                        form.setFieldValue("audience", {
                          type: "permission",
                          permission: listToPermission(vals.map(Number)),
                        })
                      }
                      comboboxProps={{
                        transitionProps: {
                          transition: "fade",
                          duration: 100,
                          timingFunction: "ease",
                        },
                      }}
                    />
                  )}
                </Stack>
              );
            })}
        </Group>
        {!lockedUserIds && editing?.audience_type !== "users" && (
          <Group gap="xs" align="center" mb="xs">
            <Checkbox
              label="常驻通知"
              {...form.getInputProps("persistent", { type: "checkbox" })}
            />
            <HoverCard width={280} shadow="md" withArrow>
              <HoverCard.Target>
                <ThemeIcon variant="subtle" color="gray" size="xs" style={{ cursor: "pointer" }}>
                  <IconHelp />
                </ThemeIcon>
              </HoverCard.Target>
              <HoverCard.Dropdown>
                <Text size="sm">
                  勾选后，发布之后才注册的新用户也能看到此通知；不勾选则只有发布时已注册的用户可见。
                </Text>
              </HoverCard.Dropdown>
            </HoverCard>
          </Group>
        )}
        <DatesProvider settings={{ locale: "zh-cn", firstDayOfWeek: 0, weekendDays: [0, 6] }}>
          <DateTimePicker
            label="过期时间（可选）"
            placeholder="到期后不再展示"
            valueFormat="YYYY-MM-DD HH:mm:ss"
            clearable
            mb="xs"
            {...form.getInputProps("expire")}
          />
        </DatesProvider>

        <Text size="sm" mb={3}>
          正文
        </Text>
        <RichTextEditor editor={editor}>
          <RichTextEditor.Toolbar>
            <RichTextEditor.ControlsGroup>
              <RichTextEditor.Bold />
              <RichTextEditor.Italic />
              <RichTextEditor.Underline />
              <RichTextEditor.Strikethrough />
              <RichTextEditor.ClearFormatting />
              <RichTextEditor.Highlight />
              <RichTextEditor.Code />
            </RichTextEditor.ControlsGroup>
            <RichTextEditor.ControlsGroup>
              <RichTextEditor.H1 />
              <RichTextEditor.H2 />
              <RichTextEditor.H3 />
            </RichTextEditor.ControlsGroup>
            <RichTextEditor.ControlsGroup>
              <RichTextEditor.Blockquote />
              <RichTextEditor.Hr />
              <RichTextEditor.BulletList />
              <RichTextEditor.OrderedList />
            </RichTextEditor.ControlsGroup>
            <RichTextEditor.ControlsGroup>
              <RichTextEditor.Link />
              <RichTextEditor.Unlink />
              <RichTextEditor.Control onClick={imageDialog.open} aria-label="插入图片">
                <IconPhoto size={16} color="gray" />
              </RichTextEditor.Control>
            </RichTextEditor.ControlsGroup>
          </RichTextEditor.Toolbar>
          <ScrollArea style={{ height: 240 }}>
            <RichTextEditor.Content />
          </ScrollArea>
        </RichTextEditor>

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            取消
          </Button>
          <Button type="submit">{editing ? "保存" : "发布"}</Button>
        </Group>
      </form>
    </Modal>
  );
}
