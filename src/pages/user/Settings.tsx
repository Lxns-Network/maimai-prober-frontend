import { Text, Card, LoadingOverlay, Mark, Anchor } from '@mantine/core';
import { useEffect, useState } from "react";
import { deletePlayerScores, unbindPlayer } from "../../utils/api/player";
import { deleteSelfUser, getUserConfig, updateUserConfig } from "../../utils/api/user";
import { SettingsSection } from '../../components/Settings/SettingsSection';
import { useLocalStorage } from "@mantine/hooks";
import { Link, useNavigate } from "react-router-dom";
import classes from "../Page.module.css"
import { openAlertModal, openConfirmModal, openRetryModal } from "../../utils/modal.tsx";
import { Page } from "@/components/Page/Page.tsx";

interface ConfigProps {
  allow_crawl_scores?: boolean;
  allow_crawl_name_plate?: boolean;
  allow_crawl_frame?: boolean;
  allow_crawl_map_icon?: boolean;
  crawl_scores_method?: string;
  crawl_scores_difficulty?: string[];
  allow_third_party_fetch_player?: boolean;
  allow_third_party_fetch_scores?: boolean;
  allow_third_party_write_data?: boolean;
}

const crawlConfigData = {
  maimai: [{
    key: "allow_crawl_scores",
    title: "允许爬取谱面成绩",
    description: "关闭后，每次爬取时将不会爬取成绩数据。",
    optionType: "switch",
    defaultValue: true,
  }, {
    key: "allow_overwrite_best_score",
    title: "允许覆盖最佳成绩",
    description: "允许后，每次“完整爬取”或通过第三方开发者写入时会检查成绩是否低于最佳成绩，低于则覆盖最佳成绩。",
    optionType: "switch",
    defaultValue: false,
  }, {
    key: "allow_crawl_collection",
    title: "收藏品爬取设置",
    description: "设置每次爬取时是否爬取头像、姓名框、背景。",
    optionType: "group",
    settings: [{
      key: "allow_crawl_icon",
      title: "允许爬取头像",
      description: "允许后，每次爬取将会爬取头像并显示到玩家信息中。",
      optionType: "switch",
      defaultValue: true,
    }, {
      key: "allow_crawl_name_plate",
      title: "允许爬取姓名框",
      description: "允许后，每次爬取将会爬取姓名框并显示到玩家信息中。",
      optionType: "switch",
      defaultValue: false,
    }, {
      key: "allow_crawl_frame",
      title: "允许爬取背景",
      description: "允许后，每次爬取将会爬取背景并显示到玩家信息中。",
      optionType: "switch",
      defaultValue: false,
    }],
  }, {
    key: "crawl_scores_method",
    title: "爬取谱面成绩的方式",
    description: <>
      设置每次爬取时使用的爬取方式。<Anchor component={Link} to="/docs/settings#爬取谱面成绩的方式">了解更多</Anchor>
    </>,
    placeholder: "请选择爬取方式",
    optionType: "select",
    defaultValue: "auto",
    options: [{
      value: "auto",
      label: "自动检测",
    }, {
      value: "full",
      label: "完整爬取",
    }, {
      value: "incremental",
      label: "增量爬取",
    }]
  }, {
    key: "crawl_scores_difficulty",
    title: "爬取谱面成绩的难度",
    description: "设置每次“完整爬取”时爬取的难度页面，难度越少爬取越稳定。",
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
    }, {
      value: "utage",
      label: "💮 U·TA·GE",
    }]
  }],
  chunithm: [{
    key: "allow_crawl_scores",
    title: "允许爬取谱面成绩",
    description: "关闭后，每次爬取时将不会爬取成绩数据。",
    optionType: "switch",
    defaultValue: true,
  }, {
    key: "allow_overwrite_best_score",
    title: "允许覆盖最佳成绩",
    description: "允许后，每次“完整爬取”或通过第三方开发者写入时会检查成绩是否低于最佳成绩，低于则覆盖最佳成绩。",
    optionType: "switch",
    defaultValue: false,
  }, {
    key: "allow_crawl_collection",
    title: "收藏品爬取设置",
    description: "设置每次爬取时是否爬取角色、名牌版、地图头像。",
    optionType: "group",
    settings: [{
      key: "allow_crawl_character",
      title: "允许爬取角色",
      description: "允许后，每次爬取将会爬取角色并显示到玩家信息中。",
      optionType: "switch",
      defaultValue: true,
    }, {
      key: "allow_crawl_name_plate",
      title: "允许爬取名牌版",
      description: "允许后，每次爬取将会爬取名牌版并显示到玩家信息中。",
      optionType: "switch",
      defaultValue: false,
    }, {
      key: "allow_crawl_map_icon",
      title: "允许爬取地图头像",
      description: "允许后，每次爬取将会爬取地图头像并显示到玩家信息中。",
      optionType: "switch",
      defaultValue: false,
    }],
  }, {
    key: "crawl_scores_difficulty",
    title: "爬取谱面成绩的难度",
    description: "设置每次“完整爬取”时爬取的难度页面，难度越少爬取越稳定。",
    placeholder: "请选择难度",
    optionType: "multi-select",
    defaultValue: ["basic", "advanced", "expert", "master", "ultima"],
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
      value: "ultima",
      label: "⚫ ULTIMA",
    }, {
      value: "worldsend",
      label: "🌈 WORLD'S END",
    }]
  }],
}

const SettingsContent = () => {
  const [config, setConfig] = useState({} as ConfigProps);
  const [fetching, setFetching] = useState(true);
  const [game] = useLocalStorage<"maimai" | "chunithm">({ key: 'game' });
  const navigate = useNavigate();

  const getUserConfigHandler = async () => {
    try {
      const res = await getUserConfig(game);
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      setConfig(data.data);
    } catch (error) {
      openRetryModal("账号设置获取失败", `${error}`, getUserConfigHandler)
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (!game) return;

    setFetching(true);
    getUserConfigHandler();
  }, [game]);

  const updateUserConfigHandler = async (key: string, value: any) => {
    const newConfig = {
      ...config,
      [key]: value,
    };

    try {
      const res = await updateUserConfig(game, newConfig);
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
    } catch (error) {
      openRetryModal("保存设置失败", `${error}`, () => updateUserConfigHandler(key, value));
    } finally {
      setConfig(newConfig);
    }
  }

  const unbindPlayerHandler = async () => {
    try {
      const res = await unbindPlayer(game);
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      openAlertModal("解绑成功", `你的「${game === "chunithm" ? "中二节奏" : "舞萌 DX"}」账号已经被解绑。`)
    } catch (error) {
      openRetryModal("解绑失败", `${error}`, unbindPlayerHandler);
    }
  }

  const deletePlayerScoresHandler = async () => {
    try {
      const res = await deletePlayerScores(game);
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      openAlertModal("删除成功", `你的查分器账号里所有的「${game === "chunithm" ? "中二节奏" : "舞萌 DX"}」谱面成绩已经被删除。`)
    } catch (error) {
      openRetryModal("删除失败", `${error}`, deletePlayerScoresHandler);
    }
  }

  const deleteSelfUserHandler = async () => {
    try {
      const res = await deleteSelfUser();
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message);
      }
      localStorage.removeItem("token");
      window.location.href = "/";
    } catch (error) {
      openRetryModal("删除失败", `${error}`, deleteSelfUserHandler);
    }
  }

  return (
    <div>
      <Card withBorder radius="md" className={classes.card} mb="md">
        <LoadingOverlay visible={fetching} overlayProps={{ radius: "sm", blur: 2 }} zIndex={1} />
        <Text fz="lg" fw={700}>
          爬取数据
        </Text>
        <Text fz="xs" c="dimmed" mt={3} mb="lg">
          设置每次爬取「{game === "chunithm" ? "中二节奏" : "舞萌 DX"}」的方式与获取的数据
        </Text>
        <SettingsSection onChange={updateUserConfigHandler} value={config} data={(crawlConfigData as any)[game ? game : 'maimai']} />
      </Card>
      <Card withBorder radius="md" className={classes.card} mb="md">
        <LoadingOverlay visible={fetching} overlayProps={{ radius: "sm", blur: 2 }} zIndex={1} />
        <Text fz="lg" fw={700}>
          隐私设置
        </Text>
        <Text fz="xs" c="dimmed" mt={3} mb="lg">
          将影响第三方开发者通过查分器 API 访问你的「{game === "chunithm" ? "中二节奏" : "舞萌 DX"}」数据
        </Text>
        <SettingsSection onChange={updateUserConfigHandler} value={config} data={[{
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
          key: "allow_third_party_fetch_history",
          title: "允许读取历史成绩",
          description: `关闭后，第三方开发者将无法获取你的 ${game === "maimai" ? "DX Rating" : "Rating"} 趋势与成绩上传历史记录。`,
          optionType: "switch",
          defaultValue: false,
        }, {
          key: "allow_third_party_write_data",
          title: "允许写入任何数据",
          description: "关闭后，第三方开发者将无法覆盖你的任何数据。",
          optionType: "switch",
          defaultValue: false,
        }]}
        />
      </Card>
      <Card withBorder radius="md" className={classes.card}>
        <Text fz="lg" fw={700}>
          其它设置
        </Text>
        <Text fz="xs" c="dimmed" mt={3} mb="xl">
          重置密码、删除数据等敏感操作
        </Text>
        <SettingsSection data={[{
          key: "reset_password",
          title: "重置密码",
          description: "重置你的查分器账号密码。",
          placeholder: "重置",
          optionType: "button",
          onClick: () => navigate("/forgot-password"),
        }, {
          key: "unbind_account",
          title: "解绑游戏账号",
          description: `解绑你的「${game === "chunithm" ? "中二节奏" : "舞萌 DX"}」账号。`,
          placeholder: "解绑",
          optionType: "button",
          onClick: () => openConfirmModal("解绑游戏账号", <>
            你确定要解绑你的「{game === "chunithm" ? "中二节奏" : "舞萌 DX"}」账号吗？解绑后，你可以随时重新同步游戏数据，或切换其他查分器账号绑定。
          </>, unbindPlayerHandler),
        }, {
          key: "reset_account",
          title: "删除所有谱面成绩",
          description: `删除你的查分器账号里所有的「${game === "chunithm" ? "中二节奏" : "舞萌 DX"}」谱面成绩。`,
          placeholder: "删除",
          color: "red",
          optionType: "button",
          onClick: () => openConfirmModal("删除所有谱面成绩", <>
            你确定要<Mark>删除你的查分器账号里所有的「{game === "chunithm" ? "中二节奏" : "舞萌 DX"}」谱面成绩</Mark>吗？这将包括<Mark>所有历史爬取的谱面成绩</Mark>，并且不可撤销。
          </>, deletePlayerScoresHandler, {
            confirmProps: { color: 'red' },
          }),
        }, {
          key: "delete_account",
          title: "删除账号",
          description: "删除你的查分器账号，但同步的游戏数据仍会被保留。",
          placeholder: "删除",
          color: "red",
          optionType: "button",
          onClick: () => openConfirmModal("删除账号", "你确定要删除你的查分器账号吗？该操作不可撤销，同步的游戏数据仍会被保留。", deleteSelfUserHandler, {
            confirmProps: { color: 'red' },
          }),
        }]} />
      </Card>
    </div>
  );
}

export default function Settings() {
  return (
    <Page
      meta={{
        title: "账号设置",
        description: "设置你的 maimai DX 查分器账号",
      }}
      children={<SettingsContent />}
    />
  )
}