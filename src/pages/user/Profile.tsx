import { useEffect, useState } from 'react';
import {
  Container,
  createStyles,
  Text,
  Title,
  rem,
  Group,
  Loader,
} from '@mantine/core';
import { getProfile } from '../../utils/api/user';
import { PlayerSection } from '../../components/Profile/PlayerSection';
import { UserDataProps, UserSection } from '../../components/Profile/UserSection';
import { UserBindSection } from '../../components/Profile/UserBindSection';

const useStyles = createStyles((theme) => ({
  root: {
    padding: rem(16),
    maxWidth: rem(600),
  },

  card: {
    backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[7] : theme.white,
  },
}));

export default function Profile() {
  const { classes } = useStyles();
  const [userData, setUserData] = useState<UserDataProps | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const getProfileHandler = async () => {
    try {
      const res = await getProfile();
      const data = await res.json();
      if (data.code === 200) {
        setUserData(data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoaded(true);
    }
  }

  useEffect(() => {
    document.title = "账号详情 | maimai DX 查分器";

    getProfileHandler();
  }, []);

  return (
    <Container className={classes.root} size={400}>
      <Title order={2} size="h2" weight={900} align="center" mt="xs">
        账号详情
      </Title>
      <Text color="dimmed" size="sm" align="center" mt="sm" mb="xl">
        查看你的 maimai DX 查分器账号的详情与游戏数据
      </Text>
        {!isLoaded ? (
          <Group position="center" mt="xl">
            <Loader />
          </Group>
        ) : (
          <>
            <PlayerSection />
            {userData && <UserSection userData={userData} />}
            {userData?.bind && <UserBindSection userBind={userData.bind} />}
          </>
        )}
    </Container>
  );
}
