import { Card, Grid, Text, Title } from '@mantine/core';
import classes from './YearSummarySection.module.css';
import { DonutChart } from '@mantine/charts';
import { Game } from "@/types/game";
import { YearInReviewProps } from "@/pages/public/YearInReview.tsx";

interface CardImageProps {
  game: Game;
  image: number;
  title: string;
  description: string;
  percentage?: number;
}

const CardImage = ({ game, image, title, description, percentage }: CardImageProps) => {
  return (
    <Card
      shadow="md"
      radius="md"
      style={{
        backgroundImage: `url(https://assets.lxns.net/${game}/jacket/${image}.png!webp)`,
        boxShadow: "inset 0 0 0 2000px rgba(0, 0, 0, 0.5)",
      }}
      className={[classes.card, classes.cardImage].join(" ")}
    >
      <div>
        <Text className={classes.description}>
          {description}
        </Text>
        <Title order={3} className={classes.title}>
          {title}
        </Title>
      </div>
      <Text className={classes.description}>
        占查分器全年上传谱面的 {percentage}%
      </Text>
    </Card>
  );
}

const getGameChartData = (game: Game, year: number) => {
  const versions: Array<{ id: number; name: string; color: string }> = [];

  if (game === 'maimai') {
    const baseData = [
      { id: 24000, name: '舞萌 DX 2024 谱面', value: 0, color: 'blue.6' },
      { id: 23000, name: '舞萌 DX 2023 谱面', value: 0, color: 'grape.6' },
      { id: 22000, name: '舞萌 DX 2022 谱面', value: 0, color: 'indigo.6' },
      { id: 21000, name: '舞萌 DX 2021 谱面', value: 0, color: 'red.6' },
      { id: 20000, name: '舞萌 DX 谱面', value: 0, color: 'yellow.6' },
      { id: 10000, name: '其它', value: 0, color: 'gray.6' },
    ];
    
    if (year >= 2025) {
      versions.push({ id: 25000, name: '舞萌 DX 2025 谱面', color: 'cyan.6' });
    }
    
    return [...versions.map(v => ({ ...v, value: 0 })), ...baseData];
  } else {
    const baseData = [
      { id: 22000, name: 'LUMINOUS 谱面', value: 0, color: 'pink.6' },
      { id: 21500, name: 'SUN PLUS 谱面', value: 0, color: 'orange.7' },
      { id: 21000, name: 'SUN 谱面', value: 0, color: 'orange.6' },
      { id: 20500, name: 'NEW PLUS 谱面', value: 0, color: 'yellow.7' },
      { id: 20000, name: 'NEW 谱面', value: 0, color: 'yellow.6' },
      { id: 10000, name: '其它', value: 0, color: 'gray.6' },
    ];
    
    if (year >= 2025) {
      versions.push({ id: 23000, name: 'VERSE 谱面', color: 'violet.6' });
      versions.push({ id: 22500, name: 'LUMINOUS PLUS 谱面', color: 'violet.6' });
    }
    
    return [...versions.map(v => ({ ...v, value: 0 })), ...baseData];
  }
};

export const YearSummarySection = ({ data }: { data: YearInReviewProps }) => {
  const playerTotal = Object.values(data.player_total_uploads).reduce((sum, value) => sum + value, 0);
  const dayInYearPercentage = (() => {
    const currentYear = new Date().getFullYear();
    const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    const daysInYear = isLeapYear(currentYear) ? 366 : 365;
    return Math.floor(data.player_upload_days / daysInYear * 100);
  })();

  const calcPercentage = (numerator: number) => {
    if (!data.prober_total_uploads) {
      return 0;
    }
    return Math.floor((numerator / data.prober_total_uploads) * 1000000) / 10000;
  };

  const cardData = [
    {
      image: data.player_most_uploaded_song.all_version,
      title: (() => {
        return `全年总计上传 ${playerTotal} 次谱面，堪称劳模！`;
      })(),
      description: '总谱面上传量',
      percentage: calcPercentage(playerTotal),
    },
    {
      image: data.player_most_uploaded_song.latest_version,
      title: (() => {
        let uploads = data.player_total_uploads[data.latest_version];
        if (data.game === "chunithm") {
          uploads = Object.entries(data.player_total_uploads).reduce((sum, [version, value]) => {
            if (parseInt(version) >= 21000) {
              return sum + value;
            }
            return sum;
          }, 0);
        }
        let gameTitle = '';
        switch (data.year) {
          case 2024:
            gameTitle = data.game === 'maimai' ? '舞萌 DX 2024' : '中二节奏 2025';
            break;
          case 2025:
            gameTitle = data.game === 'maimai' ? '舞萌 DX 2025' : '中二节奏 2026';
            break;
        }
        if (!uploads) {
          return `今年你还没有上传过${gameTitle} 新曲谱面，是不是还在等待想要游玩的新曲呢？`;
        }
        return `上传了 ${uploads} 次${gameTitle} 新曲谱面，紧跟潮流！`;
      })(),
      description: '新曲谱面上传量',
      percentage: calcPercentage(data.player_total_uploads[data.latest_version] || 0),
    },
  ];

  const chartData = getGameChartData(data.game, data.year).map((item) => ({
    ...item,
    value: data.player_total_uploads[item.id] || 0,
  }));
  const filteredChartData = chartData.filter((item) => item.value > 0);

  return (
    <Grid>
      <Grid.Col span={{ base: 12, sm: 6 }}>
        <Card className={classes.card} shadow="md" withBorder radius="md">
          <div>
            <Text className={classes.description}>
              上传谱面统计
            </Text>
            <Title order={3} className={classes.title}>
              看看你今年上传了多少次谱面吧！
            </Title>
          </div>
          {filteredChartData.length > 0 ? (
            <DonutChart
              labelsType="percent"
              withLabels
              mx="auto"
              data={filteredChartData}
            />
          ) : (
            <Text c="dimmed">暂无上传数据，调整好状态再来试试吧！</Text>
          )}
        </Card>
      </Grid.Col>
      {cardData.map((item) => (
        <Grid.Col span={{ base: 12, sm: 6 }} key={item.title}>
          <CardImage game={data.game} {...item} />
        </Grid.Col>
      ))}
      <Grid.Col span={{ base: 12, sm: 6 }}>
        <Card className={classes.card} shadow="md" withBorder radius="md">
          <div>
            <Text className={classes.description}>
              全年上传天数统计
            </Text>
            <Title order={3} className={classes.title}>
              今年你有记录的上传天数达到了 {data.player_upload_days} 天，占全年 {dayInYearPercentage}%！
              {(() => {
                if (dayInYearPercentage < 1) {
                  return `虽然上传频率略低，但每一次上传都充满了你的音乐热情！`
                } else if (dayInYearPercentage < 10) {
                  return `你的热情有没有突破极限？`
                } else if (dayInYearPercentage < 50) {
                  return `你的热情简直爆棚！`
                } else {
                  return `你的热情简直无法用言语形容！`
                }
              })()}
            </Title>
          </div>
          <Text className={classes.description}>
            这一年，你打卡了多少天？
          </Text>
        </Card>
      </Grid.Col>
    </Grid>
  );
}