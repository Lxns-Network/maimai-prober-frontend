import {
  Button,
  Card,
  Group, LoadingOverlay,
  Text,
  TextInput,
} from "@mantine/core";
import { useStyles } from "./PlayerSection";
import { useForm } from "@mantine/form";
import { updateUserBind } from "../../utils/api/user";
import { useState } from "react";
import AlertModal from "../AlertModal";
import useAlert from "../../utils/useAlert";

export interface UserBindProps {
  qq?: number;
}

export const UserBindSection = ({ userBind }: { userBind: UserBindProps | null }) => {
  const { isAlertVisible, alertTitle, alertContent, openAlert, closeAlert } = useAlert();
  const { classes } = useStyles();
  const [visible, setVisible] = useState(false);

  const form = useForm({
    initialValues: {
      qq: (userBind?.qq || '').toString(),
    },

    validate: {
      qq: (value) => /^\d{5,11}$/.test(value) ? null : "QQ 号格式不正确",
    },

    transformValues: (values) => ({
      qq: parseInt(values.qq),
    })
  });

  const updateUserBindHandler = () => {
    setVisible(true);

    updateUserBind(form.getTransformedValues())
      .then(res => res?.json())
      .then(data => {
        setVisible(false);
        if (data.code === 200) {
          openAlert("绑定成功", "第三方开发者将可以通过绑定信息获取你的游戏数据");
        } else {
          openAlert("绑定失败", data.message);
        }
      })
      .catch(error => {
        setVisible(false);
        openAlert("绑定失败", error);
      })
  }

  return (
    <Card withBorder radius="md" className={classes.card} mb="md">
      <AlertModal
        title={alertTitle}
        content={alertContent}
        opened={isAlertVisible}
        onClose={closeAlert}
      />
      <Group position="apart" noWrap spacing="xl" align="center" mb="md">
        <div>
          <Text fz="lg" fw={700}>
            第三方账号绑定
          </Text>
          <Text fz="xs" c="dimmed" mt={3}>
            绑定第三方账号，第三方开发者将可以通过绑定信息获取你的游戏数据
          </Text>
        </div>
      </Group>
      <form onSubmit={form.onSubmit(() => {updateUserBindHandler()})}>
        <LoadingOverlay visible={visible} overlayBlur={2} />
        <TextInput
          label="QQ"
          placeholder="请输入你的 QQ 号"
          variant="filled"
          mb={5}
          {...form.getInputProps('qq')}
        />
        <Group position="right" mt="md">
          <Button color="blue" type="submit" disabled={!form.isDirty()}>保存</Button>
        </Group>
      </form>
    </Card>
  )
}