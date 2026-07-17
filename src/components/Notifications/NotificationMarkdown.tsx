import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

const notificationSanitizeSchema = {
  ...defaultSchema,
  tagNames: [...new Set([...(defaultSchema.tagNames ?? []), "mark", "u"])],
};

const notificationMarkdownComponents: Components = {
  img: ({ src, alt, title }) => (
    <img
      src={src}
      alt={alt ?? ""}
      title={title}
      loading="lazy"
      style={{ maxWidth: "100%", height: "auto" }}
    />
  ),
};

export function NotificationMarkdown({ content }: { content: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw, [rehypeSanitize, notificationSanitizeSchema]]}
      components={notificationMarkdownComponents}
    >
      {content}
    </Markdown>
  );
}
