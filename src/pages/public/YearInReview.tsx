import React, { useEffect, useState } from "react";
import {
  Title, Text, Button, Container, rem, Center, Group, Avatar, Anchor, useMantineTheme, Transition, Box, Loader,
  TextInput, Alert,
  Image
} from '@mantine/core';
import {
  IconAlertCircle, IconArrowDown, IconArrowRight, IconPhotoOff, IconShare
} from "@tabler/icons-react";
import { Footer } from "../../components/Shell/Footer/Footer";
import classes from './YearInReview.module.css';
import { ASSET_URL } from "@/main.tsx";
import { YearSummarySection } from "@/components/YearInReview/YearSummarySection.tsx";
import { SongRankingSection } from "@/components/YearInReview/SongRankingSection.tsx";
import { TagRadarSection } from "@/components/YearInReview/TagRadarSection.tsx";
import { UploadRhythmSection } from "@/components/YearInReview/UploadRhythmSection.tsx";
import { SongTimelineSection } from "@/components/YearInReview/SongTimelineSection.tsx";
import { RateDistributionSection } from "@/components/YearInReview/RateDistributionSection.tsx";
import { DifficultyGenreSection } from "@/components/YearInReview/DifficultyGenreSection.tsx";
import { RatingGrowthSection } from "@/components/YearInReview/RatingGrowthSection.tsx";
import { Game } from "@/types/game";
import { useClipboard, useInViewport, useMediaQuery } from "@mantine/hooks";
import { openConfirmModal } from "@/utils/modal.tsx";
import { useYearInReview } from "@/hooks/swr/useYearInReview.ts";
import useGame from "@/hooks/useGame.ts";
import { fetchAPI } from "@/utils/api/api.ts";
import { notifications } from "@mantine/notifications";
import { useNavigate, useParams } from "react-router-dom";
import { ChunithmBestsProps, MaimaiBestsProps } from "@/types/score";

export interface YearInReviewProps {
  game: Game;
  year: number;
  latest_version: number;
  player_name: string;
  player_avatar_id: number;
  player_total_uploads: Record<number, number>;
  prober_total_uploads: number;
  player_most_uploaded_song: {
    latest_version: number;
    all_version: number;
  };
  player_most_uploaded_songs: Record<number, number>;
  player_upload_days: number;
  player_tags: Record<number, number>;
  player_monthly_uploads: Record<number, number>;
  player_hourly_uploads: Record<number, number>;
  player_song_timeline: Record<number, number[]>;
  // 仅 2025 年及以后
  rate_distribute?: Record<string, number>; // maimai
  rank_distribute?: Record<string, number>; // chunithm
  full_combo_distribute?: Record<string, number>;
  rating_growth?: {
    earliest_bests: MaimaiBestsProps | ChunithmBestsProps;
    latest_bests: MaimaiBestsProps | ChunithmBestsProps;
  };
  difficulty_distribute?: Record<string, number>;
  most_played_genres?: Record<string, number>;
  most_played_bpm_ranges?: Record<string, number>;
}

const LazyLoadSection = ({ children }: { children: React.ReactNode }) => {
  const { ref, inViewport } = useInViewport();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (inViewport && !visible) {
      setVisible(true);
    }
  }, [inViewport]);

  return (
    <Box mih={300} ref={ref}>
      <Transition
        mounted={visible}
        transition="pop"
        duration={400}
        timingFunction="ease"
        keepMounted
      >
        {(styles) => (
          <div style={styles}>
            {children}
          </div>
        )}
      </Transition>
    </Box>
  );
}

interface YearInReviewContentProps {
  data: YearInReviewProps;
  onCreateShareLink: () => void;
}

const YearInReviewContent = ({ data, onCreateShareLink }: YearInReviewContentProps) => {
  const theme = useMantineTheme();
  const small = useMediaQuery(`(max-width: ${theme.breakpoints.xs})`);

  return (
    <>
      <Center mt={rem(30)}>
        <IconArrowDown className={classes.arrow} color="gray" size={small ? 48 : 64} />
      </Center>

      <Container className={classes.section} mt={rem(30)} size="lg">
        <Center ta="center" mb={50}>
          <div>
            <Title order={1} mb="xs" fw={900}>全年数据大揭秘</Title>
            <Text size="lg" c="dimmed">
              你全年上传了多少谱面？答案比你想的更疯狂！
            </Text>
          </div>
        </Center>
        <LazyLoadSection>
          <YearSummarySection data={data} />
        </LazyLoadSection>
      </Container>

      <Container className={classes.section} mt={rem(100)}>
        <Center ta="center" mb={50}>
          <div>
            <Title order={1} mb="xs" fw={900}>最爱曲目排行榜</Title>
            <Text size="lg" c="dimmed">
              这一年，你最常上传的曲目有哪些？来看看你的 Top 10 吧！
            </Text>
          </div>
        </Center>
        <LazyLoadSection>
          <SongRankingSection data={data} />
        </LazyLoadSection>
      </Container>

      {data.game === "maimai" && (
        <Container className={classes.section} mt={rem(100)}>
          <Center ta="center" mb={16}>
            <div>
              <Title order={1} mb="xs" fw={900}>谱面标签雷达</Title>
              <Text size="lg" c="dimmed">
                你的标签偏好是什么？来看看你的标签雷达吧！
              </Text>
            </div>
          </Center>
          <LazyLoadSection>
            <TagRadarSection data={data} />
          </LazyLoadSection>
        </Container>
      )}

      <Container className={classes.section} mt={rem(100)}>
        <Center ta="center" mb={50}>
          <div>
            <Title order={1} mb="xs" fw={900}>每日上传小秘密</Title>
            <Text size="lg" c="dimmed">
              你的上传节奏如何？来看看你的一年上传时间线吧！
            </Text>
          </div>
        </Center>
        <LazyLoadSection>
          <UploadRhythmSection data={data} />
        </LazyLoadSection>
      </Container>

      <Container className={classes.section} mt={rem(100)}>
        <Center ta="center" mb={50}>
          <div>
            <Title order={1} mb="xs" fw={900}>月度上传冠军揭晓</Title>
            <Text size="lg" c="dimmed">
              月度最爱，12 位冠军曲目谁能赢得全年的殊荣？
            </Text>
          </div>
        </Center>
        <LazyLoadSection>
          <SongTimelineSection data={data} />
        </LazyLoadSection>
      </Container>

      {data.year >= 2025 && (data.rate_distribute || data.rank_distribute || data.full_combo_distribute) && (
        <Container className={classes.section} mt={rem(100)}>
          <Center ta="center" mb={50}>
            <div>
              <Title order={1} mb="xs" fw={900}>成绩分布解析</Title>
              <Text size="lg" c="dimmed">
                你的{data.game === 'maimai' ? '达成率' : '分数'}与全连水平如何？
              </Text>
            </div>
          </Center>
          <LazyLoadSection>
            <RateDistributionSection data={data} />
          </LazyLoadSection>
        </Container>
      )}

      {data.year >= 2025 && data.rating_growth && (
        <Container className={classes.section} mt={rem(100)}>
          <Center ta="center" mb={50}>
            <div>
              <Title order={1} mb="xs" fw={900}>Rating 成长之路</Title>
              <Text size="lg" c="dimmed">
                从年初到年末，你的能力提升了多少？
              </Text>
            </div>
          </Center>
          <LazyLoadSection>
            <RatingGrowthSection data={data} />
          </LazyLoadSection>

          <Text fz="xs" mt="lg" c="dimmed" ta="center">
            ※ 年初、年末指你在该年度内的首次、最后一次游玩记录所对应的 Rating。
          </Text>
        </Container>
      )}

      {data.year >= 2025 && (data.difficulty_distribute || data.most_played_genres || data.most_played_bpm_ranges) && (
        <Container className={classes.section} mt={rem(100)}>
          <Center ta="center" mb={50}>
            <div>
              <Title order={1} mb="xs" fw={900}>游玩风格画像</Title>
              <Text size="lg" c="dimmed">
                难度、曲风、节奏——看看你的独特偏好！
              </Text>
            </div>
          </Center>
          <LazyLoadSection>
            <DifficultyGenreSection data={data} />
          </LazyLoadSection>
        </Container>
      )}

      <Container className={classes.section} mt={rem(100)}>
        <Center ta="center" mb={50}>
          <div>
            <Title order={1} mb="lg" fw={900}>每一步，都是进步的足迹</Title>

            <Text size="lg" c="dimmed" mb="xs">
              回望这一年，你上传了诸多曲目成绩，创造了属于自己的记录。每一次上传，都是你与音乐之间深刻的对话，每一次数据的刷新，都是你成长的见证。
            </Text>
            <Text size="lg" c="dimmed">
              感谢你这一年来的陪伴和坚持，未来的每一天，都将是新的挑战和新的高峰，继续前行，我们一起迎接更多音乐的精彩！
            </Text>

            <Button size="lg" mt="lg" rightSection={<IconShare />} onClick={onCreateShareLink}>
              分享该页面
            </Button>
          </div>
        </Center>
      </Container>

      <Center>
        <Image src="/year_in_review_footer.webp" maw={150} mb={50} />
      </Center>
    </>
  )
};

export default function YearInReview() {
  const [game] = useGame();
  const params = useParams();
  const year = params.year ? parseInt(params.year) : new Date().getFullYear() - 1;
  const shareToken = params["*"];
  const [agree, setAgree] = useState(false);

  const { data, isLoading, error } = useYearInReview(game, year, shareToken, agree);
  const [shareLink, setShareLink] = useState('');
  const clipboard = useClipboard({ timeout: 500 });
  const navigate = useNavigate();
  const theme = useMantineTheme();
  const small = useMediaQuery(`(max-width: ${theme.breakpoints.xs})`);
  const isLoggedOut = !localStorage.getItem("token");

  useEffect(() => {
    if (isLoggedOut && !shareToken) {
      navigate("/login");
      return;
    }
    
    if (![2024, 2025].includes(year)) {
      navigate("/404");
    }
  }, [year, isLoggedOut, shareToken, navigate]);

  useEffect(() => {
    if (data) {
      document.title = `${data.player_name} 的 ${year} 年度总结 | maimai DX 查分器`;

      setAgree(false);
      if (shareToken) {
        setShareLink(`${window.location.origin}/year-in-review/${year}/${shareToken}`);
      }
    } else {
      document.title = `${year} 年度总结 | maimai DX 查分器`;
    }
  }, [data]);

  const createShareLink = () => {
    const handler = async () => {
      let url;

      if (!shareToken) {
        const res = await fetchAPI(`user/${game}/player/year-in-review/${year}/share`, {
          method: 'POST',
          body: {
            public: true,
          },
        })
        const resData = await res.json();
        if (!resData.success) {
          notifications.show({
            title: "分享链接生成失败",
            message: resData.message,
            autoClose: 5000,
          });
          return;
        }
        url = `${window.location.origin}/year-in-review/${year}/${resData.data.share_token}`;
      } else {
        url = shareLink;
      }

      clipboard.copy(`🎉 ${data?.player_name} 的「${data?.game === "chunithm" ? "中二节奏" : "舞萌 DX"}」${year} 年度总结出炉！ 🎉
看看我这一年上传了多少曲目，哪个最受欢迎！🔥
快来看看我的年度总结吧！
${url}`);
      notifications.show({
        title: "分享链接已生成",
        message: "链接已复制到剪贴板，快去分享给好友吧！",
        autoClose: 2000,
      })
      setShareLink(url);
    }
    if (shareToken) {
      handler();
      return;
    }
    openConfirmModal("创建分享链接", "创建分享链接，即代表您同意将本页面的所有信息分享给他人。", handler);
  }

  const faqData = [{
    title: "年度总结的数据来源是什么？",
    content: `本页面的数据来源于您在查分器上传的谱面成绩。如果您 ${year} 年内在查分器上传了谱面成绩，那么您可以在本页面看到您的数据。我们不保证数据的准确性，结果仅供参考。`,
  }, {
    title: "本页面统计的次数是什么？",
    content: `本页面统计的次数是您在 ${year} 年内上传的谱面成绩个数，而非单次上传的次数。`,
  },{
    title: "别人能看到我的数据吗？",
    content: "本页面的数据仅供您查看，不会被其他人看到。如果您想要分享您的数据，请点击上方的“分享该页面”按钮。生成后会有一个永久链接，别人访问这个链接时可以看到您的数据。",
  }, {
    title: "统计范围是什么时候到什么时候？",
    content: `本页面的数据统计范围是 ${year} 年 1 月 1 日至 12 月 31 日，以成绩的上传时间（而非实际游玩时间）为准。`,
  }];

  if (isLoggedOut && !shareToken) {
    return null;
  }

  return (
    <>
      <Container className={classes.root}>
        <Container className={classes.section} size="lg">
          {data && (
            <Group className={classes.playerTitle} mb="xs">
              <Text className={classes.highlight} fw={700} component="span" inherit>
                <Group>
                  <Avatar
                    className={classes.playerAvatar}
                    src={`${ASSET_URL}/${data.game}/${data.game === "maimai" ? "icon" : "character"}/${data.player_avatar_id}.png!webp`}
                    size={small ? 32 : 48}
                    radius={0}
                  >
                    <IconPhotoOff />
                  </Avatar>
                  {data.player_name}
                </Group>
              </Text>
              <Title>的</Title>
            </Group>
          )}

          <Title className={classes.title}>
            {(data ? data.game : game) === 'maimai' ? '舞萌 DX' : '中二节奏'}{' '}
            <Text variant="gradient" component="span" inherit>
              {year}
            </Text>{' '}
            年度总结
          </Title>

          <Container p={0}>
            <Text size="lg" c="dimmed" className={classes.description}>
              你在 {year} 年度上传了多少谱面？你的最爱是哪首曲目？你的标签雷达是什么样的？你的每日上传节奏又是怎样的呢？让我们一起揭晓！
            </Text>
          </Container>

          {data && (
            <Group mt="lg">
            {shareLink && (
              <TextInput
                size={small ? "md" : "lg"}
                value={shareLink}
                onFocus={(e) => e.target.select()}
                style={{ flex: small ? 1 : 'unset' }}
                readOnly
              />
            )}
              <Button
                size={small ? "md" : "lg"}
                rightSection={<IconShare />}
                onClick={createShareLink}
              >
                分享该页面
              </Button>
            </Group>
          )}
        </Container>

        {isLoading && (
          <Container ta="center" my={100}>
            <Center>
              <Loader type="bars" size={48} />
            </Center>
            <Text mt="md">正在生成数据...</Text>
          </Container>
        )}

        {error && (
          <Container className={classes.section}>
            {error.message === "agree is required" || error.message === "invalid year" ? (
              <Group mt="lg">
                <Button
                  size={small ? "md" : "lg"}
                  onClick={() => setAgree(true)}
                  rightSection={<IconArrowRight />}
                  disabled={new Date(`${year+1}-01-01 00:00:00`).getTime() > new Date().getTime() ||
                    new Date().getFullYear() > year + 1}
                >
                  生成数据
                </Button>
                {new Date().getFullYear() > year + 1 && (
                  <Text c="dimmed">
                    您已超过该年度总结的数据生成期限
                  </Text>
                )}
                {new Date(`${year+1}-01-01 00:00:00`).getTime() > new Date().getTime() && (
                  <Text c="dimmed">
                    {new Date(`${year+1}-01-01`).toLocaleDateString()} 后可生成数据
                  </Text>
                )}
              </Group>
            ) : (
              <Alert variant="light" icon={<IconAlertCircle />} title="数据加载失败" color="red" mt={50}>
                {(() => {
                  if (error.message === "player not found") {
                    return "未找到对应的玩家数据，请先同步游戏数据。";
                  }
                  if (error.message === "score not found") {
                    return `您在 ${year} 年内没有上传过谱面成绩。`;
                  }
                  return error.message;
                })()}
              </Alert>
            )}
          </Container>
        )}

        {data && (
          <YearInReviewContent data={data} onCreateShareLink={createShareLink} />
        )}

        <Container className={classes.section} mt={rem(50)}>
          <div>
            <Title order={2} mb="xs">特别鸣谢</Title>
            <Text c="dimmed">
              <Anchor href="https://dxrating.net/search" target="_blank">DXRating.net</Anchor> 提供的舞萌 DX 曲目标签数据支持
            </Text>
          </div>
        </Container>

        <Container className={classes.section} mt={rem(50)}>
          <div>
            <Title order={2} mb="xs">常见问题</Title>
            {faqData.map((item, index) => (
              <div key={index}>
                <Title order={4} mt="xl" mb="xs">
                  {item.title}
                </Title>
                <Text c="dimmed">
                  {item.content}
                </Text>
              </div>
            ))}
          </div>
        </Container>

        {year > 2024 && (
          <Container className={classes.section} mt={rem(80)}>
            <Center>
              <div>
                <Title order={3} mb="md" ta="center">往年记录</Title>
                <Center>
                  <Group gap="md">
                    {Array.from({ length: year - 2024 }, (_, i) => 2024 + i).map((pastYear) => (
                      <Button
                        key={pastYear}
                        component="a"
                        href={`/year-in-review/${pastYear}`}
                        variant="default"
                        size="md"
                      >
                        {pastYear} 年度总结
                      </Button>
                    ))}
                  </Group>
                </Center>
              </div>
            </Center>
          </Container>
        )}
      </Container>
      <Footer/>
    </>
  );
}