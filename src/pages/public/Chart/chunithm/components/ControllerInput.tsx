import { useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Divider,
  Group,
  Menu,
  SimpleGrid,
  Text,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconChevronDown, IconPlug, IconPlugConnected } from "@tabler/icons-react";
import {
  LANE_COUNT,
  type SurfaceSample,
} from "@lxns-network/chunithm-chart-engine/chart/play/input";
import { readController, type ControllerTransport } from "../input/controllers/connection";
import type { ControllerLightWriter } from "../input/controllers/adapter";
import styles from "./PlaySettings.module.css";

const channels = Array.from({ length: LANE_COUNT * 2 }, (_, index) => index);
const released: SurfaceSample = { touch: 0, beams: 0 };
const airLevels = [
  { label: "低", mask: 0b000011 },
  { label: "中", mask: 0b001100 },
  { label: "高", mask: 0b110000 },
] as const;
const controllerOptions = [
  { transport: "usb", label: "TASOLLER / TASOLLER Plus" },
  { transport: "hid", label: "Chu Pico" },
] as const;

export function ControllerInput({
  onInput,
  onLights,
}: {
  onInput(sample: SurfaceSample | null, receivedAt: number): void;
  onLights(writer: ControllerLightWriter | null): void;
}) {
  const active = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const air = useRef<HTMLDivElement>(null);
  const latest = useRef<SurfaceSample | null>(null);
  const shown = useRef(released);
  function paint() {
    const sample = latest.current ?? released;
    if (!grid.current || !air.current) return;
    const changed = shown.current.touch ^ sample.touch;
    for (let bits = changed; bits; bits &= bits - 1) {
      const bit = bits & -bits;
      const cell = grid.current.children[31 - Math.clz32(bit)];
      cell.setAttribute("aria-checked", String(!!(sample.touch & bit)));
    }
    const changedBeams = shown.current.beams ^ sample.beams;
    for (let i = 0; i < airLevels.length; i++) {
      const { mask } = airLevels[i];
      if (changedBeams & mask)
        air.current.children[i].setAttribute("aria-checked", String(!!(sample.beams & mask)));
    }
    shown.current = sample;
  }
  const available = controllerOptions.filter(
    ({ transport }) => typeof navigator !== "undefined" && !!navigator[transport],
  );
  const supported = available.length > 0;
  const showMenu = !name && available.length > 1;
  const unsupportedHint = supported
    ? undefined
    : "请使用支持 WebUSB 或 WebHID 的浏览器，通过 HTTPS 或 localhost 打开。";
  const idleStatus = supported ? "未连接设备" : "无法连接控制器";
  useEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
      onLights(null);
    },
    [onLights],
  );

  async function connect(transport: ControllerTransport) {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    let frame = 0;
    try {
      await readController(
        transport,
        controller.signal,
        (sample, receivedAt) => {
          if (active.current !== controller) return;
          onInput(sample, receivedAt);
          latest.current = sample;
          if (!frame)
            frame = requestAnimationFrame(() => {
              frame = 0;
              paint();
            });
        },
        (connected) => {
          if (active.current !== controller) return;
          if (connected) {
            setName(connected.name);
            setPending(false);
          }
          onLights(connected?.writeLights ?? null);
        },
      );
    } catch (reason) {
      if (!controller.signal.aborted)
        notifications.show({
          title: "控制器连接异常",
          message: reason instanceof Error ? reason.message : String(reason),
          color: "red",
        });
    } finally {
      cancelAnimationFrame(frame);
      if (active.current === controller) {
        if (latest.current) onInput(null, performance.now());
        latest.current = null;
        paint();
        active.current = null;
        setName(null);
        setPending(false);
      }
    }
  }

  const button = (
    <Button
      size="xs"
      variant={name ? "default" : "filled"}
      aria-label={name ? `断开 ${name}` : "连接设备"}
      aria-description={unsupportedHint}
      aria-disabled={!supported || undefined}
      data-disabled={!supported || undefined}
      loading={pending}
      rightSection={showMenu ? <IconChevronDown size={14} aria-hidden /> : undefined}
      onClick={() => {
        if (name) active.current?.abort();
        else if (available.length === 1) void connect(available[0].transport);
      }}
    >
      {name ? "断开" : "连接"}
    </Button>
  );
  return (
    <>
      <Group gap="xs" justify="space-between" wrap="nowrap">
        <Group gap="xs" wrap="nowrap" miw={0}>
          <ThemeIcon variant="transparent" color={name ? "teal" : "gray"} size="sm" aria-hidden>
            {name ? <IconPlugConnected size={18} /> : <IconPlug size={18} />}
          </ThemeIcon>
          <Text size="sm" fw={500} truncate role="status">
            {name ?? (pending ? "正在连接…" : idleStatus)}
          </Text>
        </Group>
        {showMenu ? (
          <Menu shadow="md" position="bottom-end">
            <Menu.Target>{button}</Menu.Target>
            <Menu.Dropdown>
              {available.map(({ transport, label }) => (
                <Menu.Item key={transport} onClick={() => void connect(transport)}>
                  {label}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        ) : (
          <Tooltip
            label={unsupportedHint}
            disabled={supported}
            position="top-end"
            events={{ hover: true, focus: true, touch: true }}
            withArrow
          >
            {button}
          </Tooltip>
        )}
      </Group>
      <Divider />
      <Text size="xs" c="dimmed">
        地键
      </Text>
      <SimpleGrid
        ref={grid}
        cols={LANE_COUNT}
        spacing={2}
        className={styles.groundRows}
        role="group"
        aria-label="地键输入"
      >
        {channels.map((index) => (
          <Box
            key={index}
            className={styles.inputLight}
            h={14}
            bdrs="xs"
            role="checkbox"
            aria-label={`分区 ${Math.floor(index / 2) + 1} ${index % 2 === 0 ? "上排" : "下排"}`}
            aria-readonly="true"
            aria-checked="false"
          />
        ))}
      </SimpleGrid>
      <Group justify="space-between" wrap="nowrap">
        <Text size="xs" c="dimmed">
          AIR 输入
        </Text>
        <Group ref={air} gap={4} wrap="nowrap" role="group" aria-label="AIR 输入">
          {airLevels.map(({ label }) => (
            <Box
              key={label}
              component="span"
              className={styles.inputLight}
              w={24}
              h={8}
              bdrs="xl"
              role="checkbox"
              aria-label={`${label}位`}
              aria-readonly="true"
              aria-checked="false"
            />
          ))}
        </Group>
      </Group>
    </>
  );
}
