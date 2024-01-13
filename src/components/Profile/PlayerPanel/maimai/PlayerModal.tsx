import {
  Accordion, Card, Container, Flex, Group,
  Modal, ScrollArea, Text,
} from "@mantine/core";
import { useEffect, useState } from "react";
import { MaimaiPlayerProps } from "./PlayerPanel.tsx";
import { getPlayerRatingTrend } from "../../../../utils/api/player.tsx";
import { PlayerContent } from "./PlayerContent.tsx";
import { IconDatabaseOff } from "@tabler/icons-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

interface ModalProps {
  player: MaimaiPlayerProps;
  opened: boolean;
  onClose: () => void;
}

interface RatingTrendProps {
  total: number;
  standard_total: number;
  dx_total: number;
  date: string;
}

const RatingTrend = ({ trend }: { trend: RatingTrendProps[] }) => {
  return (
    <Accordion.Item value="history">
      <Accordion.Control>DX Rating 趋势图</Accordion.Control>
      <Accordion.Panel>
        {trend.length < 2 ? (
          <Flex gap="xs" align="center" direction="column" c="dimmed">
            <IconDatabaseOff size={64} />
            <Text fz="sm">历史记录不足，无法生成图表</Text>
          </Flex>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={trend} margin={{ top: 10, right: 20, left: 12, bottom: 0 }}>
              <defs>
                <linearGradient id="dx_rating" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tickFormatter={(value) => new Date(value).toLocaleDateString('zh-CN', {
                month: "numeric",
                day: "numeric",
              })} />
              <YAxis width={40} domain={([dataMin, dataMax]) => {
                return [Math.floor(dataMin), Math.floor(dataMax)];
              }} />
              <CartesianGrid strokeDasharray="3 3" />
              <Tooltip content={(props) => {
                if (!props.active || !props.payload || props.payload.length < 1) return null;
                const payload = props.payload[0].payload;
                return (
                  <Card p="xs" withBorder fz="sm">
                    <Text>{new Date(payload.date).toLocaleDateString()}</Text>
                    <Text color="#8884d8">DX Rating: {payload.total}</Text>
                    <Group spacing="xs">
                      <Text color="#FD7E14">B35: {payload.standard_total}</Text>
                      <Text color="#228BE6">B15: {payload.dx_total}</Text>
                    </Group>
                  </Card>
                )
              }} />
              <Area dataKey="total" stroke="#8884d8" fillOpacity={1} fill="url(#dx_rating)" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
        <Text fz="xs" c="dimmed" mt="xs">※ 该数据由历史同步成绩推出，而非玩家的历史 DX Rating，结果仅供参考。</Text>
      </Accordion.Panel>
    </Accordion.Item>
  )
}

export const PlayerModal = ({ player, opened, onClose }: ModalProps) => {
  const [trend, setTrend] = useState<RatingTrendProps[]>([]);

  const getPlayerRatingTrendHandler = async () => {
    try {
      const res = await getPlayerRatingTrend('maimai');
      const data = await res.json();
      if (data.code !== 200) {
        return;
      }
      setTrend(data.data);
    } catch (err) {
      console.log(err);
    }
  }

  useEffect(() => {
    getPlayerRatingTrendHandler();
  }, []);

  return (
    <Modal.Root opened={opened} onClose={() => onClose()} centered>
      <Modal.Overlay />
      <Modal.Content>
        <Modal.Header>
          <Modal.Title>玩家详情</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body p={0}>
          <ScrollArea pb="md">
            <Container>
              <PlayerContent player={player} />
            </Container>
          </ScrollArea>
          <Container mb="md">
            <Group>
              {player.name_plate && (
                <div>
                  <Text fz="xs" c="dimmed">姓名框</Text>
                  <Text fz="sm">{player.name_plate.name}</Text>
                </div>
              )}
              {player.frame && (
                <div>
                  <Text fz="xs" c="dimmed">背景板</Text>
                  <Text fz="sm">{player.frame.name}</Text>
                </div>
              )}
              <div>
                <Text fz="xs" c="dimmed">上次同步时间</Text>
                <Text fz="sm">{(new Date(Date.parse(player.upload_time))).toLocaleString()}</Text>
              </div>
            </Group>
          </Container>
          <Accordion chevronPosition="left" variant="filled" radius={0} defaultValue="history">
            {trend && trend.length > 0 && (
              <RatingTrend trend={trend} />
            )}
          </Accordion>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}