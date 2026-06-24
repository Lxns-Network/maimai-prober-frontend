import { Pagination, PaginationProps } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";

// 统一分页：窄屏缩小尺寸（sm），宽屏 md。不用 layout="responsive"——它会给根元素加
// container-type: inline-size，在居中收缩容器里宽度坍缩，导致永远塌缩成「page x of x」。
export function ResponsivePagination({ size, ...props }: PaginationProps) {
  const small = useMediaQuery("(max-width: 30rem)");
  return <Pagination size={size ?? (small ? "sm" : "md")} {...props} />;
}
