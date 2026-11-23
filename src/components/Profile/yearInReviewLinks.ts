import { IconCalendarStats } from "@tabler/icons-react";
import { SUPPORTED_YEARS } from "@/pages/(csr)/year-in-review/config";

/** 图标为组件，由使用方决定尺寸。 */
export const yearInReviewLinks = [...SUPPORTED_YEARS]
  .sort((a, b) => b - a)
  .map((year) => ({
    label: `${year} 年度总结`,
    icon: IconCalendarStats,
    to: `/year-in-review/${year}`,
  }));
