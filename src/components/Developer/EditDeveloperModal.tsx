import { useForm } from "@mantine/form";
import { updateDeveloperInfo } from "@/utils/api/developer.ts";
import { openAlertModal, openRetryModal } from "@/utils/modal.tsx";
import { Button, Group, Modal, TextInput } from "@mantine/core";
import { DeveloperProps } from "@/types/developer";
import { validateText, validateUrl } from "@/utils/validator.ts";

interface FormValues {
  name: string;
  url: string;
}

interface EditDeveloperModalProps {
  opened: boolean;
  close: () => void;
  developer: DeveloperProps;
  onSuccess: () => void;
}

export const EditDeveloperModal = ({ opened, close, developer, onSuccess }: EditDeveloperModalProps) => {
  const form = useForm<FormValues>({
    initialValues: {
      name: "",
      url: "",
    },

    validate: {
      name: (value) => validateText(value, {
        allowEmpty: false,
        textLabel: "开发者名称",
        minLength: 4,
        maxLength: 16,
      }),
      url: (value) => validateUrl(value, { allowEmpty: false, urlLabel: "开发者地址" }),
    },

    transformValues: (values) => {
      const data = { name: "", url: "" };
      if (values.name && values.name.trim() !== "") {
        data.name = values.name.trim();
      }
      if (values.url && values.url.trim() !== "") {
        data.url = values.url.trim();
      }
      return data;
    },
  });

  const updateDeveloperInfoHandler = async (values: FormValues) => {
    const transformedValues = form.getTransformedValues();
    
    // 如果两个字段都为空，不提交
    if (Object.keys(transformedValues).length === 0) {
      close();
      return;
    }

    try {
      const res = await updateDeveloperInfo(transformedValues);
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      openAlertModal("修改成功", "开发者信息已更新。");
      onSuccess();
      close();
    } catch (err) {
      openRetryModal("修改失败", `${err}`, () => updateDeveloperInfoHandler(values));
    }
  }

  return (
    <Modal opened={opened} onClose={close} onExitTransitionEnd={form.reset} title="编辑开发者信息" centered>
      <form onSubmit={form.onSubmit(updateDeveloperInfoHandler)}>
        <TextInput
          label="开发者名称"
          placeholder={developer.name}
          mb="xs"
          {...form.getInputProps("name")}
        />
        <TextInput
          label="开发者地址"
          placeholder={developer.url}
          mb="xs"
          {...form.getInputProps("url")}
        />
        <Group justify="flex-end" mt="lg">
          <Button variant="default" onClick={close}>取消</Button>
          <Button color="blue" type="submit">保存</Button>
        </Group>
      </form>
    </Modal>
  )
}
