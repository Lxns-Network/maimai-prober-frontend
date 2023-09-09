import { Title, Text, Alert } from '@mantine/core';
import { Container, rem, createStyles } from '@mantine/core';
import SettingsSection from "../../components/Settings/SettingsSection";
import Icon from "@mdi/react";
import { mdiCodeTags } from "@mdi/js";

const useStyles = createStyles(() => ({
  root: {
    padding: rem(16),
    maxWidth: rem(600),
  },
}));

export default function Settings() {
  const { classes } = useStyles();

  return (
    <Container className={classes.root} size={400}>
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
      <SettingsSection title="爬取数据" description="设置每次爬取的方式与获取的数据" data={[{
        key: "allow_crawl_scores",
        title: "允许爬取谱面成绩",
        description: "关闭后，每次爬取时将不会爬取成绩数据。",
        optionType: "switch",
        defaultValue: true,
      }, {
        key: "crawl_scores_method",
        title: "爬取谱面成绩的方式",
        description: "设置每次爬取时使用的爬取方式，增量爬取依赖最近游玩记录，适合已经完整爬取后频繁爬取，更加稳定。",
        placeholder: "请选择爬取方式",
        optionType: "select",
        defaultValue: "full",
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
        defaultValue: ["basic", "advanced", "expert", "master", "remaster"],
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
      <SettingsSection title="隐私设置" description="将影响第三方开发者通过查分器 API 访问你的数据" data={[{
        key: "allow_third_party_fetch_player",
        title: "允许读取玩家信息",
        description: "关闭后，第三方开发者将无法获取你的玩家信息。",
        optionType: "switch",
        defaultValue: true,
      }, {
        key: "allow_third_party_fetch_scores",
        title: "允许读取谱面成绩",
        description: "关闭后，第三方开发者将无法获取你的谱面成绩。",
        optionType: "switch",
        defaultValue: true,
      }, {
        key: "allow_third_party_write_data",
        title: "允许写入任何数据",
        description: "关闭后，第三方开发者将无法覆盖你的任何数据。",
        optionType: "switch",
        defaultValue: false,
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
    </Container>
  );
}