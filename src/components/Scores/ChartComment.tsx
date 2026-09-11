import {
  ActionIcon,
  Anchor,
  Avatar,
  Box,
  Button,
  Center,
  Divider,
  Flex,
  Group,
  Image,
  Loader,
  Menu,
  NumberFormatter,
  Paper,
  Rating,
  Stack,
  Text,
  Textarea,
  ThemeIcon,
} from "@mantine/core";
import { Game } from "@/types/game";
import { ASSET_URL } from "@/main";
import {
  IconDots,
  IconFlag2Filled,
  IconHeart,
  IconHeartFilled,
  IconMenu2,
  IconMessage,
  IconPhotoOff,
  IconTrash,
} from "@tabler/icons-react";
import { EmptyState } from "@/components/EmptyState.tsx";
import classes from "./ChartComment.module.css";
import { useForm } from "@mantine/form";
import { ChunithmScoreProps, MaimaiScoreProps } from "@/types/score";
import { useEffect, useMemo, useRef, useState } from "react";
import { type OverlayLinkProps } from "@/hooks/useResumableOverlay";
import { openConfirmModal, openRetryModal } from "@/utils/modal.tsx";
import { checkPermission, getLoginUserId, UserPermission } from "@/utils/session.ts";
import { useToggle } from "@mantine/hooks";
import { Comment, useScoreComments } from "@/hooks/queries/useScoreComments.ts";
import {
  useCreateComment,
  useDeleteComment,
  useLikeComment,
  useUnlikeComment,
} from "@/hooks/mutations/useCommentMutations.ts";
import { ResponsivePagination } from "@/components/ResponsivePagination.tsx";

interface FormValues {
  comment: string;
  rating: number;
}

const MAX_COMMENT_LENGTH = 100;
const PAGE_SIZE = 5;
const SORT_OPTIONS = [
  { value: "hot", label: "热度" },
  { value: "new", label: "最新" },
  { value: "rating", label: "评分" },
];
const RATING_TEXT = ["粪谱", "勉强能玩", "能玩", "好玩", "神谱"];

const ChartCommentForm = ({
  game,
  score,
  comment,
  onSubmit,
}: {
  game: Game;
  score: MaimaiScoreProps | ChunithmScoreProps | null;
  comment?: Comment;
  onSubmit: () => void;
}) => {
  const form = useForm<FormValues>({
    initialValues: {
      comment: "",
      rating: 0,
    },

    validate: {
      comment: (value, values) => {
        if (value.length > MAX_COMMENT_LENGTH) {
          return `评论长度超过 ${MAX_COMMENT_LENGTH} 字`;
        }
        if (value.length < 1 && values.rating === 0) {
          return "请至少输入一条评论或评分";
        }
        return null;
      },
      rating: (value, values) => {
        if (value === 0 && values.comment.length < 1) return "请至少输入一条评论或评分";
        return null;
      },
    },
  });
  const isLoggedOut = !localStorage.getItem("token");
  const { mutate: submitComment } = useCreateComment();
  const appliedComment = useRef<Comment | undefined>(undefined);

  const submitCommentHandler = (values: FormValues) => {
    const comment = {
      song_id: score?.id,
      song_type: null as string | null,
      difficulty: score?.level_index,
      comment: values.comment,
      rating: values.rating,
    };
    if (score && "achievements" in score) {
      comment.song_type = score.type;
    }
    submitComment(
      { game, data: comment },
      {
        onSuccess: () => {
          form.resetDirty(values);
          onSubmit();
        },
        onError: (error) =>
          openRetryModal("评论提交失败", `${error}`, () => submitCommentHandler(values)),
      },
    );
  };

  const { setValues, resetDirty, isDirty } = form;

  useEffect(() => {
    if (comment && comment !== appliedComment.current && !isDirty()) {
      const values = {
        comment: comment.comment ?? "",
        rating: comment.rating ?? 0,
      };
      setValues(values);
      resetDirty(values);
    }
    appliedComment.current = comment;
  }, [comment, setValues, resetDirty, isDirty]);

  return (
    <>
      <Stack gap="sm">
        <Textarea
          classNames={{ input: classes.textarea }}
          placeholder="分享你对这张谱面的看法吧！"
          disabled={isLoggedOut}
          {...form.getInputProps("comment")}
        />
        <Group justify="space-between">
          <Group gap="xs">
            <Rating fractions={2} readOnly={isLoggedOut} {...form.getInputProps("rating")} />
            <Text size="xs" c="gray">
              {form.values.rating === 0
                ? "轻触评分"
                : RATING_TEXT[parseInt((form.values.rating - 0.5).toString())]}
            </Text>
          </Group>
          <Group>
            <Text size="xs" c={form.values.comment.length > MAX_COMMENT_LENGTH ? "red" : "dimmed"}>
              {form.values.comment.length} / {MAX_COMMENT_LENGTH} 字
            </Text>
            <Button
              size="sm"
              disabled={!form.isValid()}
              onClick={() => {
                let title = "提交评论";
                let message = "你在一张谱面中只能提交一次评论，确定要提交这条评论吗？";
                if (comment) {
                  title = "编辑评论";
                  message = "编辑评论后，你的原评论将被替换，确定要编辑这条评论吗？";
                }
                openConfirmModal(title, message, () => submitCommentHandler(form.values));
              }}
            >
              {comment ? "编辑" : "提交"}
            </Button>
          </Group>
        </Group>
      </Stack>
    </>
  );
};

const CommentItem = ({
  game,
  comment,
  profileLinkProps,
  onUpdate,
  onDelete,
  onRevert,
}: {
  game: Game;
  comment: Comment;
  profileLinkProps: OverlayLinkProps;
  onUpdate?: (comment: Comment) => void;
  onDelete?: (comment: Comment) => void;
  onRevert?: () => void;
}) => {
  const { mutate: removeComment } = useDeleteComment();
  const { mutate: like } = useLikeComment();
  const { mutate: unlike } = useUnlikeComment();
  const profileUrl = `/profile/${encodeURIComponent(comment.uploader.name)}?game=${game}`;

  const deleteCommentHandler = () => {
    // Optimistic: remove from list immediately
    onDelete && onDelete(comment);
    removeComment(
      { game, commentId: comment.comment_id },
      {
        onError: (error) => {
          // Revert: refetch from server to restore the comment
          onRevert && onRevert();
          openRetryModal("评论删除失败", `${error}`, deleteCommentHandler);
        },
      },
    );
  };

  const likeCommentHandler = (is_liked: boolean) => {
    // Optimistic: update UI immediately
    const prevComment = { ...comment };
    const updatedComment = {
      ...comment,
      like_count: is_liked ? comment.like_count - 1 : comment.like_count + 1,
      is_liked: !is_liked,
    };
    onUpdate && onUpdate(updatedComment);

    const mutationFn = is_liked ? unlike : like;
    mutationFn(
      { game, commentId: comment.comment_id },
      {
        onError: (error) => {
          onUpdate && onUpdate(prevComment);
          openRetryModal("评论点赞失败", `${error}`, () => likeCommentHandler(is_liked));
        },
      },
    );
  };

  return (
    <Box>
      <Group>
        <Avatar
          component="a"
          {...profileLinkProps}
          href={profileUrl}
          aria-label={`查看 ${comment.uploader.name} 的档案`}
          src={`${ASSET_URL}/${game}/${game === "maimai" ? "icon" : "character"}/${comment.uploader.avatar_id || (game === "maimai" ? 1 : 0)}.png!webp`}
          radius={0}
        >
          <IconPhotoOff />
        </Avatar>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Flex columnGap="md" align="baseline" wrap="wrap">
            <Anchor
              {...profileLinkProps}
              href={profileUrl}
              fz="md"
              c="inherit"
              underline="hover"
              style={{ overflowWrap: "anywhere" }}
            >
              {comment.uploader.name}
            </Anchor>
            <Text fz="xs" c="dimmed">
              {new Date(comment.upload_time).toLocaleString()}
            </Text>
          </Flex>
          <Group h={18}>
            <Rating value={comment.rating} fractions={2} size="xs" readOnly />
            {comment.like_count && (
              <Group gap={0} align="flex-start">
                <ThemeIcon variant="transparent" size="xs" c="red">
                  <IconHeartFilled style={{ width: "90%", height: "90%" }} />
                </ThemeIcon>
                <Text size="xs" c="dimmed">
                  {comment.like_count}
                </Text>
              </Group>
            )}
          </Group>
        </div>
        <Group gap="xs">
          <ActionIcon
            variant="subtle"
            color="red"
            onClick={() => likeCommentHandler(comment.is_liked)}
          >
            {comment.is_liked ? <IconHeartFilled size={16} /> : <IconHeart size={16} />}
          </ActionIcon>
          <Menu shadow="md" width={200} position="bottom-end">
            <Menu.Target>
              <ActionIcon className={classes.actionIcon} variant="subtle">
                <IconDots size={18} stroke={1.5} />
              </ActionIcon>
            </Menu.Target>

            <Menu.Dropdown>
              <Menu.Label>更多操作</Menu.Label>
              {comment.uploader && comment.uploader.id !== getLoginUserId() && (
                <Menu.Item
                  c="red"
                  leftSection={<IconFlag2Filled size={20} stroke={1.5} />}
                  disabled
                >
                  举报滥用
                </Menu.Item>
              )}
              {(checkPermission(UserPermission.Administrator) ||
                (comment.uploader && comment.uploader.id === getLoginUserId())) && (
                <Menu.Item
                  c="red"
                  leftSection={<IconTrash size={20} stroke={1.5} />}
                  onClick={() => {
                    openConfirmModal("删除评论", "你确定要删除该评论吗？", deleteCommentHandler);
                  }}
                >
                  删除
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
      {comment.comment && (
        <>
          <Box pt="xs" pl={54}>
            <Text size="sm">{comment.comment}</Text>
          </Box>
        </>
      )}
    </Box>
  );
};

export const ChartComment = ({
  game,
  score,
  profileLinkProps,
}: {
  game: Game;
  score: MaimaiScoreProps | ChunithmScoreProps | null;
  profileLinkProps: OverlayLinkProps;
}) => {
  const isLoggedOut = !localStorage.getItem("token");
  const { comments, isLoading, setData, invalidate } = useScoreComments({
    game,
    params: !isLoggedOut
      ? {
          song_id: score ? `${score.id}` : "",
          level_index: score ? `${score.level_index}` : "",
          ...(score && "type" in score ? { song_type: score.type } : {}),
        }
      : undefined,
  });
  const [sort, toggleSort] = useToggle(SORT_OPTIONS.map((option) => option.value));
  const [page, setPage] = useState(1);

  const sortedComments = useMemo(() => {
    return [...comments].sort((a, b) => {
      const hasCommentA = !!a.comment;
      const hasCommentB = !!b.comment;
      if (hasCommentA !== hasCommentB) {
        return hasCommentB ? 1 : -1;
      }

      if (sort === "hot") {
        return (b.like_count ?? 0) - (a.like_count ?? 0);
      } else if (sort === "new") {
        return new Date(b.upload_time).getTime() - new Date(a.upload_time).getTime();
      } else if (sort === "rating") {
        return (b.rating ?? 0) - (a.rating ?? 0);
      }

      return 0;
    });
  }, [sort, comments]);

  const getTotalRating = () => {
    const filteredComments = comments.filter((comment) => comment.rating);
    if (filteredComments.length < 3) return 0;
    const totalRating = filteredComments.reduce((acc, comment) => acc + comment.rating!, 0);
    return totalRating / filteredComments.length;
  };

  return (
    <Stack>
      <Group>
        <ThemeIcon variant="subtle" color="gray">
          <IconMessage style={{ width: "100%", height: "100%" }} stroke={1.5} />
        </ThemeIcon>
        <Stack gap={2} style={{ flex: 1 }}>
          <Text size="lg">评论</Text>
          <Text size="xs" c="dimmed">
            {comments.length} 条评论
          </Text>
        </Stack>
        <Button
          variant="subtle"
          color="gray"
          size="compact-xs"
          leftSection={<IconMenu2 size={16} stroke={1.5} />}
          onClick={() => toggleSort()}
        >
          按{SORT_OPTIONS.find((option) => option.value === sort)?.label}
        </Button>
        <Divider orientation="vertical" />
        <Stack gap={4}>
          {getTotalRating() === 0 ? (
            <Text size="lg" mr="xs" c="dimmed">
              数据不足
            </Text>
          ) : (
            <Text
              size="xs"
              c="dimmed"
              component={Group}
              align="baseline"
              justify="space-between"
              gap="xs"
            >
              <Text
                size="lg"
                span
                style={{
                  color: "var(--mantine-color-yellow-filled)",
                }}
              >
                {RATING_TEXT[parseInt((getTotalRating() - 0.5).toString())]}
              </Text>
              <span>
                (
                <NumberFormatter
                  value={getTotalRating()}
                  decimalScale={1}
                  fixedDecimalScale={true}
                />
                )
              </span>
            </Text>
          )}
          <Rating value={getTotalRating()} fractions={2} size="xs" readOnly />
        </Stack>
      </Group>
      <Group justify="center">
        {isLoading ? (
          <Center>
            <Loader />
          </Center>
        ) : comments.length === 0 ? (
          <EmptyState
            icon={<Image src="/empty.webp" w={240} />}
            title={isLoggedOut ? "请登录后查看玩家评论" : "还没有人发表看法呢~"}
          />
        ) : (
          <Paper w="100%" p="md" radius="sm" withBorder>
            <Stack>
              {sortedComments
                .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
                .map((comment, index, array) => (
                  <div key={comment.comment_id}>
                    <CommentItem
                      game={game}
                      comment={comment}
                      profileLinkProps={profileLinkProps}
                      onUpdate={(updatedComment) => {
                        const newComments = [...comments];
                        const index = newComments.findIndex(
                          (c) => c.comment_id === updatedComment.comment_id,
                        );
                        if (index !== -1) {
                          newComments[index] = updatedComment;
                          setData(newComments);
                        }
                      }}
                      onDelete={(deletedComment) => {
                        const newComments = comments.filter(
                          (c) => c.comment_id !== deletedComment.comment_id,
                        );
                        setData(newComments);
                      }}
                      onRevert={invalidate}
                    />
                    {index < array.length - 1 && <Divider mt="md" />}
                  </div>
                ))}
            </Stack>
          </Paper>
        )}
        <ResponsivePagination
          total={Math.ceil(comments.length / PAGE_SIZE)}
          value={page}
          onChange={setPage}
          hideWithOnePage
        />
      </Group>
      <ChartCommentForm
        game={game}
        score={score}
        comment={comments.find((comment) => comment.uploader.id === getLoginUserId())}
        onSubmit={() => invalidate()}
      />
    </Stack>
  );
};
