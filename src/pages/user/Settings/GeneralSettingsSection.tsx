import { Text, Card, LoadingOverlay, Mark } from '@mantine/core';
import { SettingList, SettingValue } from '@/components/Settings/SettingList.tsx';
import { Link } from "@/components/Link";
import classes from "../../Page.module.css"
import { openAlertModal, openConfirmModal, openRetryModal } from "@/utils/modal.tsx";
import { useUserConfig } from "@/hooks/queries/useUserConfig.ts";
import useGame from "@/hooks/useGame.ts";
import { Anchor } from '@mantine/core';
import { useUpdateUserConfig } from "@/hooks/mutations/useUserMutations.ts";
import { useUnbindPlayer, useDeletePlayerScores } from "@/hooks/mutations/usePlayerMutations.ts";
import { ConfigProps } from "@/types/user";

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
    description: "允许后，每次「完整爬取」或通过第三方开发者写入时会检查成绩是否低于最佳成绩，低于则覆盖最佳成绩。",
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
    description: "设置每次「完整爬取」时爬取的难度页面，难度越少爬取越稳定。",
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
    description: "允许后，每次「完整爬取」或通过第三方开发者写入时会检查成绩是否低于最佳成绩，低于则覆盖最佳成绩。",
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
    description: "设置每次「完整爬取」时爬取的难度页面，难度越少爬取越稳定。",
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

export const GeneralSettingsSection = () => {
  const [game] = useGame();
  const { config, isLoading, setData } = useUserConfig(game);
  const { mutate: updateConfig } = useUpdateUserConfig();
  const { mutate: unbindPlayerMutate } = useUnbindPlayer();
  const { mutate: deleteScoresMutate } = useDeletePlayerScores();

  const updateUserConfigHandler = (key: string, value: unknown) => {
    const newConfig = {
      ...config,
      [key]: value,
    };

    const previousConfig = config;
    setData(newConfig as ConfigProps);

    updateConfig({ game, data: newConfig }, {
      onError: (error) => {
        if (previousConfig) setData(previousConfig);
        openRetryModal("保存设置失败", `${error}`, () => updateUserConfigHandler(key, value));
      },
    });
  }

  const unbindPlayerHandler = () => {
    unbindPlayerMutate(game, {
      onSuccess: () => {
        openAlertModal("解绑成功", `你的「${game === "chunithm" ? "中二节奏" : "舞萌 DX"}」账号已经被解绑。`)
      },
      onError: (error) => {
        openRetryModal("解绑失败", `${error}`, unbindPlayerHandler);
      },
    });
  }

  const deletePlayerScoresHandler = () => {
    deleteScoresMutate(game, {
      onSuccess: () => {
        openAlertModal("删除成功", `你的查分器账号里所有的「${game === "chunithm" ? "中二节奏" : "舞萌 DX"}」谱面成绩已经被删除。`)
      },
      onError: (error) => {
        openRetryModal("删除失败", `${error}`, deletePlayerScoresHandler);
      },
    });
  }

  return (
    <div>
      <Card withBorder radius="md" className={classes.card} mb="md">
        <LoadingOverlay visible={isLoading} overlayProps={{ radius: "sm", blur: 2 }} zIndex={1} />
        <Text fz="lg" fw={700}>
          爬取数据
        </Text>
        <Text fz="xs" c="dimmed" mt={3} mb="lg">
          设置每次爬取「{game === "chunithm" ? "中二节奏" : "舞萌 DX"}」的方式与获取的数据
        </Text>
        <SettingList onChange={updateUserConfigHandler} value={config as SettingValue} data={(crawlConfigData as never)[game ? game : 'maimai']} />
      </Card>
      <Card withBorder radius="md" className={classes.card} mb="md">
        <LoadingOverlay visible={isLoading} overlayProps={{ radius: "sm", blur: 2 }} zIndex={1} />
        <Text fz="lg" fw={700}>
          隐私设置
        </Text>
        <Text fz="xs" c="dimmed" mt={3} mb="lg">
          将影响第三方开发者通过查分器 API 访问你的「{game === "chunithm" ? "中二节奏" : "舞萌 DX"}」数据
        </Text>
        <SettingList onChange={updateUserConfigHandler} value={config as SettingValue} data={[{
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
      <Card withBorder radius="md" className={classes.card} mb="md">
        <LoadingOverlay visible={isLoading} overlayProps={{ radius: "sm", blur: 2 }} zIndex={1} />
        <Text fz="lg" fw={700}>
          公开设置
        </Text>
        <Text fz="xs" c="dimmed" mt={3} mb="lg">
          控制是否公开展示你的「{game === "chunithm" ? "中二节奏" : "舞萌 DX"}」数据
        </Text>
        <SettingList onChange={updateUserConfigHandler} value={config as SettingValue} data={[{
          key: "show_player_name_in_score_ranking",
          title: "在成绩排行榜中显示玩家名",
          description: "关闭后，你的玩家名将不会在其他用户的成绩排行榜中显示。",
          optionType: "switch",
          defaultValue: false,
        }]}
        />
      </Card>
      <Card withBorder radius="md" className={classes.card}>
        <Text fz="lg" fw={700}>
          账号操作
        </Text>
        <Text fz="xs" c="dimmed" mt={3} mb="lg">
          执行以下操作将会影响你的「{game === "chunithm" ? "中二节奏" : "舞萌 DX"}」数据
        </Text>
        <SettingList data={[{
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
        }]} />
      </Card>
    </div>
  );
}
