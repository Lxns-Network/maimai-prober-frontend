import { useCallback, useEffect, useState } from "react";
import { Card, Text, LoadingOverlay } from "@mantine/core";
import classes from "@/pages/Page.module.css";
import { SettingList, SettingProps } from "@/components/Settings/SettingList.tsx";
import { getSystemSettings, updateSystemSettings } from "@/utils/api/admin.ts";
import { openRetryModal } from "@/utils/modal.tsx";
import { notifications } from "@mantine/notifications";
import { RecalculateSection } from "../recalculate/RecalculateSection.tsx";

const SETTINGS_DEFAULTS: Record<string, unknown> = {
  "proxy.maintenance.maimai": false,
  "proxy.maintenance.chunithm": false,
  "worker.max_pending_tasks": 200,
  "worker.remote_only": false,
  "worker.task_timeout": 900,
  "worker.task_expire": 86400,
  "oauth.dynamic_client_retention": 2592000,
};

const PENDING_TASK_OPTIONS = [
  { value: "50", label: "50 个" },
  { value: "100", label: "100 个" },
  { value: "200", label: "200 个" },
  { value: "500", label: "500 个" },
  { value: "1000", label: "1000 个" },
];

const TIMEOUT_OPTIONS = [
  { value: "300", label: "5 分钟" },
  { value: "600", label: "10 分钟" },
  { value: "900", label: "15 分钟" },
  { value: "1800", label: "30 分钟" },
  { value: "3600", label: "1 小时" },
];

const EXPIRE_OPTIONS = [
  { value: "3600", label: "1 小时" },
  { value: "7200", label: "2 小时" },
  { value: "21600", label: "6 小时" },
  { value: "43200", label: "12 小时" },
  { value: "86400", label: "1 天" },
  { value: "172800", label: "2 天" },
  { value: "604800", label: "7 天" },
];

const DYNAMIC_CLIENT_RETENTION_OPTIONS = [
  { value: "604800", label: "7 天" },
  { value: "1209600", label: "14 天" },
  { value: "2592000", label: "30 天" },
  { value: "7776000", label: "90 天" },
];

export const SystemSettingsSection = () => {
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [fetching, setFetching] = useState(true);

  const fetchSettings = useCallback(async () => {
    setFetching(true);
    try {
      const res = await getSystemSettings();
      const data = await res.json();
      if (data.code !== 200) {
        throw new Error(data.message || "获取失败");
      }
      setSettings(data.data || {});
    } catch (error) {
      openRetryModal("获取系统设置失败", `${error}`, fetchSettings);
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const handleChange = async (key: string, value: string | boolean | string[] | null) => {
    let parsedValue: unknown = value;

    // Convert string numbers to actual numbers for numeric settings
    if (
      key === "worker.task_timeout" ||
      key === "worker.task_expire" ||
      key === "worker.max_pending_tasks" ||
      key === "oauth.dynamic_client_retention"
    ) {
      parsedValue = Number(value);
    }

    try {
      const res = await updateSystemSettings({ [key]: parsedValue });
      const data = await res.json();
      if (data.code !== 200) {
        throw new Error(data.message || "保存失败");
      }
      setSettings((prev) => ({ ...prev, [key]: parsedValue }));
      notifications.show({
        title: "保存成功",
        message: "系统设置已更新",
        color: "green",
      });
    } catch (error) {
      notifications.show({
        title: "保存失败",
        message: `${error}`,
        color: "red",
      });
    }
  };

  // Build value map with fallbacks to defaults
  const valueMap: Record<string, unknown> = {};
  for (const key of Object.keys(SETTINGS_DEFAULTS)) {
    const val = key in settings ? settings[key] : SETTINGS_DEFAULTS[key];
    // Convert numeric values to strings for select components
    if (
      key === "worker.task_timeout" ||
      key === "worker.task_expire" ||
      key === "worker.max_pending_tasks" ||
      key === "oauth.dynamic_client_retention"
    ) {
      valueMap[key] = String(val);
    } else {
      valueMap[key] = val;
    }
  }

  const proxySettingsConfig: SettingProps[] = [
    {
      key: "proxy.maintenance",
      title: "维护模式",
      description: "设置各游戏的代理服务与数据爬取维护状态。",
      optionType: "group",
      settings: [
        {
          key: "proxy.maintenance.maimai",
          title: "舞萌 DX",
          description: "启用后将暂停「舞萌 DX」的代理服务与数据爬取。",
          optionType: "switch",
          defaultValue: SETTINGS_DEFAULTS["proxy.maintenance.maimai"] as boolean,
        },
        {
          key: "proxy.maintenance.chunithm",
          title: "中二节奏",
          description: "启用后将暂停「中二节奏」的代理服务与数据爬取。",
          optionType: "switch",
          defaultValue: SETTINGS_DEFAULTS["proxy.maintenance.chunithm"] as boolean,
        },
      ],
    },
  ];

  const taskSettingsConfig: SettingProps[] = [
    {
      key: "worker.remote_only",
      title: "仅使用远程工作节点",
      description: "启用后将禁用本地工作节点，所有任务将由远程工作节点处理。",
      optionType: "switch",
      defaultValue: SETTINGS_DEFAULTS["worker.remote_only"] as boolean,
    },
    {
      key: "worker.max_pending_tasks",
      title: "排队任务上限",
      description: "达到上限后将暂时拒绝新的任务。",
      optionType: "select",
      options: PENDING_TASK_OPTIONS,
      defaultValue: String(SETTINGS_DEFAULTS["worker.max_pending_tasks"]),
    },
    {
      key: "worker.task_timeout",
      title: "任务超时时间",
      description: "单个任务的最大执行时间，超时后任务将被取消。",
      optionType: "select",
      options: TIMEOUT_OPTIONS,
      defaultValue: String(SETTINGS_DEFAULTS["worker.task_timeout"]),
    },
    {
      key: "worker.task_expire",
      title: "任务过期时间",
      description: "已完成或失败的任务超过此时间后将自动删除。",
      optionType: "select",
      options: EXPIRE_OPTIONS,
      defaultValue: String(SETTINGS_DEFAULTS["worker.task_expire"]),
    },
  ];

  const oauthSettingsConfig: SettingProps[] = [
    {
      key: "oauth.dynamic_client_retention",
      title: "动态客户端保留时间",
      description: "未使用的动态客户端超过此时间后将自动清理。",
      optionType: "select",
      options: DYNAMIC_CLIENT_RETENTION_OPTIONS,
      defaultValue: String(SETTINGS_DEFAULTS["oauth.dynamic_client_retention"]),
    },
  ];

  return (
    <div>
      <Card withBorder radius="md" className={classes.card} mb="md">
        <LoadingOverlay visible={fetching} overlayProps={{ radius: "sm", blur: 2 }} zIndex={1} />
        <Text fz="lg" fw={700}>
          代理服务
        </Text>
        <Text fz="xs" c="dimmed" mt={3} mb="lg">
          控制各游戏的代理服务与数据爬取
        </Text>
        <SettingList data={proxySettingsConfig} value={valueMap} onChange={handleChange} />
      </Card>
      <Card withBorder radius="md" className={classes.card} mb="md">
        <LoadingOverlay visible={fetching} overlayProps={{ radius: "sm", blur: 2 }} zIndex={1} />
        <Text fz="lg" fw={700}>
          任务调度
        </Text>
        <Text fz="xs" c="dimmed" mt={3} mb="lg">
          配置任务队列与任务执行方式
        </Text>
        <SettingList data={taskSettingsConfig} value={valueMap} onChange={handleChange} />
      </Card>
      <Card withBorder radius="md" className={classes.card} mb="md">
        <LoadingOverlay visible={fetching} overlayProps={{ radius: "sm", blur: 2 }} zIndex={1} />
        <Text fz="lg" fw={700}>
          OAuth
        </Text>
        <Text fz="xs" c="dimmed" mt={3} mb="lg">
          配置 OAuth 动态客户端的生命周期
        </Text>
        <SettingList data={oauthSettingsConfig} value={valueMap} onChange={handleChange} />
      </Card>
      <RecalculateSection />
    </div>
  );
};
