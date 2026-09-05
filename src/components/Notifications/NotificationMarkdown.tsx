import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

interface NotificationMarkdownProps {
  content: string;
}

export default function NotificationMarkdown({ content }: NotificationMarkdownProps) {
  return (
    <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
      {content}
    </Markdown>
  );
}
