import { ComponentPropsWithoutRef, forwardRef } from "react";
import { navigate } from "vike/client/router";

interface LinkProps extends Omit<ComponentPropsWithoutRef<"a">, "href"> {
  to: string;
  replace?: boolean;
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(
  ({ to, replace = false, onClick, children, ...props }, ref) => {
    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        e.altKey ||
        e.button !== 0 ||
        props.target === "_blank" ||
        to.startsWith("http://") ||
        to.startsWith("https://")
      ) {
        onClick?.(e);
        return;
      }

      e.preventDefault();
      onClick?.(e);

      navigate(to, { overwriteLastHistoryEntry: replace });
    };

    return (
      // Vike 会拦截所有 <a> 的点击并新增历史记录；replace 时需让它跳过，只保留这里的覆盖跳转。
      <a
        ref={ref}
        href={to}
        onClick={handleClick}
        data-vike={replace ? "false" : undefined}
        {...props}
      >
        {children}
      </a>
    );
  },
);

Link.displayName = "Link";
