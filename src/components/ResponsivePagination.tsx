import { Pagination, PaginationProps } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

// 统一分页：窄屏优先缩小尺寸（sm），并启用 layout="responsive"——空间不足时按容器查询自动收起页码。
export function ResponsivePagination({ size, ...props }: PaginationProps) {
  const small = useMediaQuery("(max-width: 30rem)");
  return <Pagination layout="responsive" size={size ?? (small ? "sm" : "md")} {...props} />;
}
