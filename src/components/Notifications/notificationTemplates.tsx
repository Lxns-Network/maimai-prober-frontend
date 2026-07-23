import { ReactNode } from "react";
import { Typography } from "@mantine/core";
import { Game } from "@/types/game";
import { NotificationAction, NotificationProps } from "@/types/notification";
import { NotificationMarkdown } from "./NotificationMarkdown.tsx";

export interface NotificationDisplay {
  title: string;
  body: ReactNode;
  action?: NotificationAction;
}

type TemplateData = Record<string, unknown>;
type NotificationTemplate = (data: TemplateData) => {
  title: string;
  body: ReactNode;
  action?: NotificationAction;
};

const templates: Record<string, NotificationTemplate> = {
  developer_approved: (data) => ({
    title: "开发者申请已通过",
    body: (
      <>
        <p>你好，{String(data.name ?? "")}：</p>
        <p>你已成功成为查分器的开发者！欢迎加入。</p>
        <p>
          请访问
          <a href="https://maimai.lxns.net/docs#%E5%BC%80%E5%8F%91%E8%80%85%E6%96%87%E6%A1%A3">
            开发者文档
          </a>
          ，了解如何对接查分器。
        </p>
        <p>
          如有问题或建议可加入开发者交流群参与讨论。如你计划使用游戏内 API
          接入，请加入开发者交流群，并联系管理员。
        </p>
        <p>
          开发者交流群请前往
          <a href="https://maimai.lxns.net/developer">开发者面板</a>
          加入。
        </p>
      </>
    ),
  }),
  alias_approved: (data) => ({
    title: "曲目别名已被批准",
    body: <p>你提交的曲目别名「{String(data.alias ?? "")}」已被批准，现在可以在查分器内搜索了。</p>,
    action:
      data.song_id != null
        ? { type: "song", game: data.game as Game, song_id: Number(data.song_id) }
        : undefined,
  }),
  comment_liked: (data) => ({
    title: "你的评论被点赞了",
    body: (
      <p>
        <strong>{String(data.liker ?? "")}</strong> 点赞了你的评论。
      </p>
    ),
    action:
      data.song_id != null && data.difficulty != null
        ? {
            type: "score",
            game: data.game as Game,
            song_id: Number(data.song_id),
            song_type: data.song_type as string | undefined,
            difficulty: Number(data.difficulty),
          }
        : data.song_id != null
          ? { type: "song", game: data.game as Game, song_id: Number(data.song_id) }
          : undefined,
  }),
};

function renderContent(content: string): ReactNode {
  return <NotificationMarkdown content={content} />;
}

export function getNotificationDisplay(n: NotificationProps): NotificationDisplay {
  const body = (content: ReactNode) => <Typography>{content}</Typography>;

  if (n.category === "broadcast") {
    return { title: n.title, body: body(renderContent(n.content)), action: n.action };
  }

  const template = templates[n.type];
  if (template) {
    const r = template(n.data ?? {});
    return { title: r.title, body: body(r.body), action: r.action ?? n.action };
  }

  return { title: "新通知", body: body(<p>你有一条新通知。</p>), action: n.action };
}
