import { ActionIcon, CopyButton, TextInput, TextInputProps, Tooltip } from "@mantine/core";
import { IconCheck, IconCopy } from "@tabler/icons-react";

interface CopyButtonWithIconProps extends Omit<TextInputProps, 'content'> {
  label: string;
  content: string;
}

export const CopyButtonWithIcon = ({ label, content, ...others }: CopyButtonWithIconProps) => {
  return (
    <TextInput
      variant="filled"
      value={content}
      onFocus={(e) => e.target.select()}
      rightSection={
        <CopyButton value={content} timeout={2000}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? '已复制' : label} withArrow position="right">
              <ActionIcon variant="subtle" color={copied ? 'teal' : 'gray'} onClick={copy}>
                {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
      }
      readOnly
      {...others}
    />
  )
}
