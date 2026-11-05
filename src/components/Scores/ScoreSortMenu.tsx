import { ActionIcon, Button, Indicator, Menu } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import {
  IconArrowsSort,
  IconRestore,
  IconSortAscending,
  IconSortDescending,
} from "@tabler/icons-react";

/** 再次点击当前排序项会翻转方向；`sortBy` 为 `null` 表示调用方的默认排序。 */
export const ScoreSortMenu = ({
  options,
  sortBy,
  reverseSortDirection,
  onChange,
}: {
  options: { key: string; name: string }[];
  sortBy: string | null;
  reverseSortDirection: boolean;
  onChange: (sortBy: string | null, reverseSortDirection: boolean) => void;
}) => {
  const small = useMediaQuery("(max-width: 30rem)");
  const currentSortKey = options.find((item) => item.key === sortBy);

  const renderSortDirectionIcon = (size: number) =>
    reverseSortDirection ? <IconSortAscending size={size} /> : <IconSortDescending size={size} />;

  return (
    <Menu shadow="md" position="bottom-end" width={200} closeOnItemClick={false}>
      <Menu.Target>
        {small ? (
          <Indicator size={8} disabled={!sortBy} withBorder>
            <ActionIcon variant="default" size="input-sm" aria-label="排序方式">
              <IconArrowsSort size={20} />
            </ActionIcon>
          </Indicator>
        ) : (
          <Button
            variant="default"
            leftSection={sortBy ? renderSortDirectionIcon(20) : <IconArrowsSort size={20} />}
          >
            {currentSortKey ? currentSortKey.name : "排序"}
          </Button>
        )}
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>排序方式</Menu.Label>
        {options.map((item) => (
          <Menu.Item
            key={item.key}
            fw={sortBy === item.key ? 500 : undefined}
            rightSection={sortBy === item.key ? renderSortDirectionIcon(16) : null}
            onClick={() => onChange(item.key, sortBy === item.key ? !reverseSortDirection : false)}
          >
            {item.name}
          </Menu.Item>
        ))}
        <Menu.Divider />
        <Menu.Item
          leftSection={<IconRestore size={16} />}
          disabled={!sortBy}
          onClick={() => onChange(null, false)}
        >
          恢复默认排序
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};
