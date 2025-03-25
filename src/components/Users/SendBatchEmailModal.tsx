import { useForm } from "@mantine/form";
import { Button, Group, Modal, ScrollArea, Text, TextInput } from "@mantine/core";
import { openConfirmModal, openRetryModal } from "@/utils/modal.tsx";
import { sendBatchEmail } from "@/utils/api/user.ts";
import { UserProps } from "@/types/user";
import { useEditor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Underline } from "@tiptap/extension-underline";
import { Link, RichTextEditor } from "@mantine/tiptap";
import { Image } from "@tiptap/extension-image"
import { Highlight } from "@tiptap/extension-highlight";
import { TextAlign } from "@tiptap/extension-text-align";
import { IconPhoto } from "@tabler/icons-react";

export const SendBatchEmailModal = ({ users, opened, close }: { users: UserProps[], opened: boolean, close(): void }) => {
  const form = useForm({
    initialValues: {
      subject: '',
      content: '',
    },

    validate: {
      subject: (value: string) => (value == "" ? "主题不能为空" : null),
      content: (value: string) => (value == "" ? "正文不能为空" : null),
    },
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        paragraph: {
          HTMLAttributes: {
            style: 'font-size: 16px; line-height: 1.6;'
          }
        },
        code: {
          HTMLAttributes: {
            style: 'background-color: #F8F9FA; padding: 1px 5px; font-size: 12px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace;'
          }
        },
        horizontalRule: {
          HTMLAttributes: {
            style: 'border: 0; border-top: 1px solid #DEE2E6; margin: 16px 0;'
          }
        },
        blockquote: {
          HTMLAttributes: {
            style: 'margin: 0; border-left: 3px solid #DEE2E6; padding-left: 16px;'
          }
        }
      }),
      Underline,
      Link.configure({
        HTMLAttributes: {
          style: 'color: #007BFF;'
        }
      }),
      Image.configure({
        HTMLAttributes: {
          style: 'max-width: 100%;'
        }
      }),
      Highlight.configure({
        HTMLAttributes: {
          style: 'background-color: #FFEC99;'
        }
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] })
    ],
    content: form.values.content,
    onUpdate: ({ editor }: { editor: any }) => {
      form.setValues({ content: editor.getHTML() });
    },
  });

  const sendBatchEmailHandler = async (values: any) => {
    try {
      const res = await sendBatchEmail({
        emails: users.map((user) => user.email),
        subject: values.subject,
        content: values.content,
      });
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
    } catch (err) {
      openRetryModal("发送失败", `${err}`, () => sendBatchEmailHandler(values));
    } finally {
      close();
    }
  }

  return (
    <Modal opened={opened} onClose={close} onExitTransitionEnd={() => {
      form.reset();
      editor?.commands.clearContent();
    }} title="群发邮件" size="lg" centered>
      <form onSubmit={form.onSubmit((values) => {
        openConfirmModal("确认发送", `确认要向 ${users.length} 名用户发送邮件吗？`, () => sendBatchEmailHandler(values));
      })}>
        <TextInput label="主题" placeholder="请输入主题" mb="xs" {...form.getInputProps("subject")} />
        <Text size="sm" mb={3}>正文</Text>
        <RichTextEditor editor={editor} withTypographyStyles={false}>
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
              <RichTextEditor.H4 />
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
              <RichTextEditor.Control onClick={()=>{
                const url = window.prompt('URL')

                if (url) {
                  editor?.chain().focus().setImage({ src: url }).run()
                }
              }}>
                <IconPhoto size={16} color="gray" />
              </RichTextEditor.Control>
            </RichTextEditor.ControlsGroup>

            <RichTextEditor.ControlsGroup>
              <RichTextEditor.AlignLeft />
              <RichTextEditor.AlignCenter />
              <RichTextEditor.AlignJustify />
              <RichTextEditor.AlignRight />
            </RichTextEditor.ControlsGroup>

            <RichTextEditor.ControlsGroup>
              <RichTextEditor.Undo />
              <RichTextEditor.Redo />
            </RichTextEditor.ControlsGroup>
          </RichTextEditor.Toolbar>

          <ScrollArea style={{ height: 300 }}>
            <RichTextEditor.Content />
          </ScrollArea>
        </RichTextEditor>
        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={close}>取消</Button>
          <Button color="blue" type="submit">发送</Button>
        </Group>
      </form>
    </Modal>
  )
}