import { useState } from 'react';
import { Button, Card, Container, createStyles, Pagination, rem, Table, Text, Title } from '@mantine/core';
import {
  IconArrowDown,
  IconArrowUp,
} from '@tabler/icons-react';

const initialElements = [
  {
    "id": 1142,
    "song_name": "NULCTRL",
    "level": "13+",
    "level_index": 3,
    "achievements": 100.2112,
    "fc": "fc",
    "fs": null,
    "dx_score": 2426,
    "dx_rating": 300.87410688,
    "rate": "sss",
    "type": "dx"
  },
  {
    "id": 1347,
    "song_name": "泥の分際で私だけの大切を奪おうだなんて",
    "level": "13",
    "level_index": 3,
    "achievements": 100.0552,
    "fc": "fc",
    "fs": null,
    "dx_score": 2261,
    "dx_rating": 293.92215552,
    "rate": "sss",
    "type": "dx"
  },
  {
    "id": 734,
    "song_name": "ENERGY SYNERGY MATRIX",
    "level": "13",
    "level_index": 2,
    "achievements": 100.6981,
    "fc": "fcp",
    "fs": null,
    "dx_score": 1803,
    "dx_rating": 292.656,
    "rate": "sssp",
    "type": "standard"
  },
  {
    "id": 837,
    "song_name": "Altale",
    "level": "13",
    "level_index": 3,
    "achievements": 100.2903,
    "fc": "fc",
    "fs": null,
    "dx_score": 1294,
    "dx_rating": 292.4465148,
    "rate": "sss",
    "type": "standard"
  },
];

const useStyles = createStyles((theme) => ({
  root: {
    padding: rem(16),
    maxWidth: rem(600),
  },

  card: {
    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
  },
}));

export default function Scores() {
  const { classes } = useStyles();
  const [elements, setElements] = useState(initialElements);
  const [sortBy, setSortBy] = useState();
  const [sortOrder, setSortOrder] = useState('asc');

  const handleSort = (key: any) => {
    setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    if (sortBy !== key) {
      setSortBy(key);
    }

    const sortedElements = [...elements].sort((a: any, b: any) => {
      if (typeof a[key] === 'string') {
        return sortOrder === 'desc' ? a[key].localeCompare(b[key]) : b[key].localeCompare(a[key]);
      } else {
        return sortOrder === 'desc' ? a[key] - b[key] : b[key] - a[key];
      }
    });

    setElements(sortedElements);
  };

  const renderSortIndicator = (key: any) => {
    if (sortBy === key) {
      return sortOrder === 'asc' ? <IconArrowUp /> : <IconArrowDown />;
    }
    return null;
  };

  const headers = [
    { name: 'ID', key: 'id' },
    { name: '曲名', key: 'song_name' },
    { name: '达成率', key: 'achievements' },
    { name: 'DX Rating', key: 'dx_rating' },
  ];

  return (
    <Container className={classes.root} size={400}>
      <Title order={2} size="h2" weight={900} align="center" mt="xs">
        账号成绩管理
      </Title>
      <Text color="dimmed" size="sm" align="center" mt="sm" mb="xl">
        你可以在这里管理你的 maimai DX 查分器账号的成绩
      </Text>
      <Card withBorder radius="md" className={classes.card} mb="md">
        <Table highlightOnHover verticalSpacing="sm">
          <thead>
          <tr>
            {headers.map((item) => (
              <th key={item.key} onClick={() => handleSort(item.key)} style={{padding: 0}}>
                <Button variant="link" fullWidth rightIcon={renderSortIndicator(item.key)} p={rem(10)} style={{display: "flex"}}>
                  {item.name}
                </Button>
              </th>
            ))}
          </tr>
          </thead>
          <tbody>
          {elements.map((element) => (
            <tr key={element.id}>
              <td>{element.id}</td>
              <td>{element.song_name}</td>
              <td>{element.achievements}%</td>
              <td>{parseInt(element.dx_rating.toString())}</td>
            </tr>
          ))}
          </tbody>
        </Table>
        <Pagination total={10} />
      </Card>
    </Container>
  );
}