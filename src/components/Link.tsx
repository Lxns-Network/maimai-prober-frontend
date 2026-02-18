import { ComponentPropsWithoutRef, forwardRef } from 'react';
import { navigate } from 'vike/client/router';

interface LinkProps extends Omit<ComponentPropsWithoutRef<'a'>, 'href'> {
  to: string;
  replace?: boolean;
  state?: unknown;
}

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(
  ({ to, replace = false, state, onClick, children, ...props }, ref) => {
    const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        e.altKey ||
        e.button !== 0 ||
        props.target === '_blank' ||
        to.startsWith('http://') ||
        to.startsWith('https://')
      ) {
        onClick?.(e);
        return;
      }

      e.preventDefault();
      onClick?.(e);

      if (replace) {
        window.history.replaceState(state, '', to);
      }
      navigate(to);
    };

    return (
      <a ref={ref} href={to} onClick={handleClick} {...props}>
        {children}
      </a>
    );
  }
);

Link.displayName = 'Link';
