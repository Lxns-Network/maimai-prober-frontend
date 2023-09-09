import {Title, Text, Alert, Loader, Group} from '@mantine/core';
import { Container, rem, createStyles } from '@mantine/core';
import SettingsSection from "../../components/Settings/SettingsSection";
import Icon from "@mdi/react";
import { mdiCodeTags } from "@mdi/js";
import { useEffect, useState } from "react";
import { getUserConfig, updateUserConfig } from "../../utils/api/api";
import useAlert from "../../utils/useAlert";
import AlertModal from "../../components/AlertModal";
import { useSetState } from "@mantine/hooks";

const useStyles = createStyles(() => ({
  root: {
    padding: rem(16),
    maxWidth: rem(600),
  },
}));

interface ConfigProps {
  allow_crawl_scores: boolean;
  crawl_scores_method: string;
  crawl_scores_difficulty: string[];
  allow_third_party_fetch_player: boolean;
  allow_third_party_fetch_scores: boolean;
  allow_third_party_write_data: boolean;
}

export default function Settings() {
  const { isAlertVisible, alertTitle, alertContent, openAlert, closeAlert } = useAlert();
  const { classes } = useStyles();
  const [config, setConfig] = useSetState({} as ConfigProps);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    document.title = "账号设置 - maimai DX 查分器";

    const getConfig = async () => {
      const res = await getUserConfig();
      if (res?.status !== 200) {
        return {};
      }
      return res.json();
    };

    getConfig().then((data) => {
      setConfig(data.data);
      setIsLoaded(true);
    });
  }, []);

  const handleConfigChange = (key: string, value: any) => {
    const newConfig = {
      ...config,
      [key]: value,
    }
    setConfig(newConfig);

    updateUserConfig(newConfig)
      .then(res => res?.json())
      .then(data => {
        if (data?.code !== 200) {
          openAlert("保存设置失败", data?.message);
        }
      })
      .catch(err => {
        openAlert("保存设置失败", err);
      });
  }

  return (
    <Container className={classes.root} size={400}>
      <AlertModal
        title={alertTitle}
        content={alertContent}
        opened={isAlertVisible}
        onClose={closeAlert}
      />
      <Title order={2} size="h2" weight={900} align="center" mt="xs">
        账号设置
      </Title>
      <Text color="dimmed" size="sm" align="center" mt="sm" mb="xl">
        设置你的 maimai DX 查分器账号
      </Text>
      <Alert radius="md" icon={<Icon path={mdiCodeTags} />} title="此页面正在开发中" color="blue" mb="md">
        <Text size="sm">
          此页面正在开发中，功能暂不可用。
        </Text>
      </Alert>
      {!isLoaded ? (
        <Group position="center" mt="xl">
          <Loader />
        </Group>
      ) : (
        <>
          <SettingsSection title="爬取数据" description="设置每次爬取的方式与获取的数据" onChange={handleConfigChange} data={[{
            key: "allow_crawl_scores",
            title: "允许爬取谱面成绩",
            description: "关闭后，每次爬取时将不会爬取成绩数据。",
            optionType: "switch",
            defaultValue: config.allow_crawl_scores ?? true,
          }, {
            key: "crawl_scores_method",
            title: "爬取谱面成绩的方式",
            description: "设置每次爬取时使用的爬取方式，增量爬取依赖最近游玩记录，适合已经完整爬取后频繁爬取，更加稳定。",
            placeholder: "请选择爬取方式",
            optionType: "select",
            defaultValue: config.crawl_scores_method ?? "full",
            options: [{
              value: "full",
              label: "完整爬取",
            }, {
              value: "incremental",
              label: "增量爬取",
            }]
          }, {
            key: "crawl_scores_difficulty",
            title: "爬取谱面成绩的难度",
            description: "设置每次完整爬取时爬取的难度页面，难度越少爬取越稳定。",
            placeholder: "请选择难度",
            optionType: "multi-select",
            defaultValue: config.crawl_scores_difficulty ?? ["basic", "advanced", "expert", "master", "remaster"],
            options: [{
              value: "basic",
              label: "🟢 BASIC",
            }, {
              value: "advanced",
              label: "🟡 ADVANCED",
            }, {
              value: "expert",
              label: "🔴 EXPERT",
            }, {
              value: "master",
              label: "🟣 MASTER",
            }, {
              value: "remaster",
              label: "⚪ Re:MASTER",
            }]
          }]}
          />
          <SettingsSection title="隐私设置" description="将影响第三方开发者通过查分器 API 访问你的数据" onChange={handleConfigChange} data={[{
            key: "allow_third_party_fetch_player",
            title: "允许读取玩家信息",
            description: "关闭后，第三方开发者将无法获取你的玩家信息。",
            optionType: "switch",
            defaultValue: config.allow_third_party_fetch_player ?? true,
          }, {
            key: "allow_third_party_fetch_scores",
            title: "允许读取谱面成绩",
            description: "关闭后，第三方开发者将无法获取你的谱面成绩。",
            optionType: "switch",
            defaultValue: config.allow_third_party_fetch_scores ?? true,
          }, {
            key: "allow_third_party_write_data",
            title: "允许写入任何数据",
            description: "关闭后，第三方开发者将无法覆盖你的任何数据。",
            optionType: "switch",
            defaultValue: config.allow_third_party_write_data ?? false,
          }]}
          />
          <SettingsSection title="其它设置" description="重置密码、删除账号等操作" data={[{
            key: "reset_password",
            title: "重置密码",
            description: "重置你的查分器账号密码。",
            placeholder: "重置",
            optionType: "button",
            onClick: () => {
            },
          }, {
            key: "reset_account",
            title: "删除所有谱面成绩",
            description: "删除你的查分器账号里所有的谱面成绩。",
            placeholder: "删除",
            color: "red",
            optionType: "button",
            onClick: () => { },
          }, {
            key: "delete_account",
            title: "删除账号",
            description: "删除你的查分器账号。",
            placeholder: "删除",
            color: "red",
            optionType: "button",
            onClick: () => { },
          }]} />
        </>
      )}
    </Container>
  );
}