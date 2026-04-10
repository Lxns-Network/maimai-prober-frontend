import { forwardRef } from "react";

interface MdiIconProps extends React.SVGProps<SVGSVGElement> {
  path: string;
  size?: number | string;
  color?: string;
}

export const Icon = forwardRef<SVGSVGElement, MdiIconProps>(
  ({ path, size = null, color = "currentColor", style = {}, ...props }, ref) => {
    const svgStyle: React.CSSProperties = { ...style };
    if (size != null) {
      svgStyle.width = typeof size === "string" ? size : `${1.5 * size}rem`;
      svgStyle.height = svgStyle.width;
    }

    return (
      <svg ref={ref} viewBox="0 0 24 24" style={svgStyle} {...props}>
        <path d={path} fill={color} />
      </svg>
    );
  }
);

Icon.displayName = "Icon";
