import { CSSProperties, ReactNode, useEffect, useId, useRef, useState } from "react";
import {
  ActionIcon,
  Box,
  CloseButton,
  Combobox,
  ElementProps,
  InputBase,
  InputBaseProps,
  Modal,
  ScrollArea,
  useVirtualizedCombobox,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { useVirtualizer } from "@tanstack/react-virtual";
import { IconArrowLeft, IconSearch } from "@tabler/icons-react";
import { AnimatePresence, motion } from "motion/react";

const HERO_TRANSITION = { type: "spring", stiffness: 400, damping: 36 } as const;

export interface VirtualizedComboboxProps<T>
  extends InputBaseProps, ElementProps<"input", keyof InputBaseProps> {
  options: T[];
  search: string;
  onSearchChange: (search: string) => void;
  getOptionId: (item: T) => string;
  getOptionValue: (item: T) => string;
  renderOption: (item: T) => ReactNode;
  onOptionSubmit: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  emptyText?: string;
  itemHeight?: number;
}

export function VirtualizedCombobox<T>({
  options,
  search,
  onSearchChange,
  getOptionId,
  getOptionValue,
  renderOption,
  onOptionSubmit,
  onClear,
  placeholder,
  emptyText = "没有找到符合条件的结果",
  itemHeight = 48,
  disabled,
  loading,
  ...others
}: VirtualizedComboboxProps<T>) {
  const isMobile = useMediaQuery("(max-width: 30rem)") === true;
  const layoutId = useId();
  const [opened, setOpened] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(-1);
  const [scrollParent, setScrollParent] = useState<HTMLDivElement | null>(null);
  const [viewportHeight, setViewportHeight] = useState<number>();
  // True when the most recent close came from a browser/device back navigation,
  // so the cleanup below does not pop the history entry a second time.
  const closedByBackRef = useRef(false);

  const virtualizer = useVirtualizer({
    count: options.length,
    getScrollElement: () => scrollParent,
    estimateSize: () => itemHeight,
    overscan: 10,
  });

  function submitByIndex(index: number) {
    const item = options[index];
    if (!item) return;
    onOptionSubmit(getOptionValue(item));
    combobox.closeDropdown();
    combobox.resetSelectedOption();
    setOpened(false);
  }

  const combobox = useVirtualizedCombobox({
    opened,
    onOpenedChange: setOpened,
    totalOptionsCount: options.length,
    getOptionId: (index) => (options[index] ? getOptionId(options[index]) : null),
    selectedOptionIndex,
    setSelectedOptionIndex: (index) => {
      setSelectedOptionIndex(index);
      if (index >= 0) {
        virtualizer.scrollToIndex(index, { align: "auto" });
      }
    },
    onSelectedOptionSubmit: submitByIndex,
  });

  useEffect(() => {
    if (!isMobile || !opened || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const update = () => setViewportHeight(viewport.height);
    update();
    viewport.addEventListener("resize", update);
    return () => viewport.removeEventListener("resize", update);
  }, [isMobile, opened]);

  // If the viewport crosses the breakpoint while the mobile modal is open (or
  // mid-exit), the mobile subtree unmounts without firing AnimatePresence's
  // onExitComplete, which would leave `mounted` stuck true (an invisible
  // full-screen modal trapping the page). Reset when leaving the mobile branch.
  useEffect(() => {
    if (!isMobile) {
      setOpened(false);
      setMounted(false);
    }
  }, [isMobile]);

  // On mobile, a device/browser "back" should dismiss the full-screen overlay
  // instead of navigating away. Push a history entry while open and close on
  // popstate; if closed via the UI instead, pop our entry to keep history tidy.
  useEffect(() => {
    if (!isMobile || !opened) return;
    closedByBackRef.current = false;
    window.history.pushState({ virtualizedComboboxModal: true }, "");
    const handlePopState = () => {
      closedByBackRef.current = true;
      setOpened(false);
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (!closedByBackRef.current && window.history.state?.virtualizedComboboxModal) {
        window.history.back();
      }
    };
  }, [isMobile, opened]);

  const showClear = search.length !== 0 && !disabled && !loading;

  const rightSection = loading ? undefined : showClear ? (
    <CloseButton
      size="sm"
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.stopPropagation();
        onClear && onClear();
      }}
    />
  ) : (
    <Combobox.Chevron />
  );

  const optionsList = (
    <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
      {virtualizer.getVirtualItems().map((virtualItem) => {
        const item = options[virtualItem.index];
        if (!item) return null;
        return (
          <Combobox.Option
            value={getOptionValue(item)}
            key={getOptionId(item)}
            ref={virtualizer.measureElement}
            data-index={virtualItem.index}
            active={virtualItem.index === selectedOptionIndex}
            onClick={() => submitByIndex(virtualItem.index)}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {renderOption(item)}
          </Combobox.Option>
        );
      })}
    </div>
  );

  if (isMobile) {
    const triggerInput = (
      <InputBase
        {...others}
        placeholder={placeholder}
        leftSection={<IconSearch size={18} />}
        rightSection={rightSection}
        rightSectionPointerEvents={showClear ? "auto" : "none"}
        value={search}
        disabled={disabled}
        loading={loading}
        readOnly
        onClick={() => {
          if (disabled || loading) return;
          setMounted(true);
          setOpened(true);
        }}
      />
    );

    return (
      <>
        <motion.div
          layoutId={layoutId}
          layout
          transition={HERO_TRANSITION}
          style={typeof others.style === "function" ? undefined : (others.style as CSSProperties)}
        >
          {triggerInput}
        </motion.div>
        <Combobox store={combobox} resetSelectionOnOptionHover={false} keepMounted>
          <Modal
            opened={mounted}
            onClose={() => setOpened(false)}
            fullScreen
            withCloseButton={false}
            padding={0}
            // Mantine does not transition; the surface/list fade and the input
            // morphs via layout animation. `mounted` is released after exit ends.
            transitionProps={{ duration: 0 }}
            overlayProps={{ backgroundOpacity: 0 }}
            styles={{
              content: {
                background: "transparent",
                boxShadow: "none",
                // Clip the morphing input so it can't extend the document and
                // produce a horizontal scrollbar mid-animation.
                overflow: "hidden",
                ...(viewportHeight ? { height: viewportHeight, maxHeight: viewportHeight } : {}),
              },
              body: { position: "relative", height: "100%", overflow: "hidden" },
            }}
          >
            <AnimatePresence onExitComplete={() => setMounted(false)}>
              {opened && (
                <motion.div
                  key="sheet"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={HERO_TRANSITION}
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    background: "var(--mantine-color-body)",
                  }}
                >
                  <Box
                    p="sm"
                    style={{
                      position: "relative",
                      zIndex: 2,
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--mantine-spacing-xs)",
                      borderBottom: "1px solid var(--mantine-color-default-border)",
                    }}
                  >
                    <ActionIcon variant="subtle" color="gray" onClick={() => setOpened(false)}>
                      <IconArrowLeft size={20} />
                    </ActionIcon>
                    <motion.div
                      layoutId={layoutId}
                      layout
                      transition={HERO_TRANSITION}
                      style={{ flex: 1 }}
                    >
                      <InputBase
                        {...others}
                        data-autofocus
                        mb={0}
                        placeholder={placeholder}
                        leftSection={<IconSearch size={18} />}
                        rightSection={
                          search.length !== 0 ? (
                            <CloseButton
                              size="sm"
                              onMouseDown={(event) => event.preventDefault()}
                              // Route through onClear (resets the selected value
                              // too) so the field and parent stay in sync after
                              // exiting; fall back to clearing just the text.
                              onClick={() => (onClear ? onClear() : onSearchChange(""))}
                            />
                          ) : undefined
                        }
                        rightSectionPointerEvents={search.length !== 0 ? "auto" : "none"}
                        value={search}
                        onChange={(event) => onSearchChange(event.currentTarget.value)}
                      />
                    </motion.div>
                  </Box>
                  <ScrollArea
                    type="scroll"
                    viewportRef={setScrollParent}
                    style={{ position: "relative", zIndex: 1, flex: 1, minHeight: 0 }}
                  >
                    <Combobox.Options style={{ padding: 2 }}>
                      {options.length === 0 ? (
                        <Combobox.Empty>{emptyText}</Combobox.Empty>
                      ) : (
                        optionsList
                      )}
                    </Combobox.Options>
                  </ScrollArea>
                </motion.div>
              )}
            </AnimatePresence>
          </Modal>
        </Combobox>
      </>
    );
  }

  return (
    <Combobox
      store={combobox}
      resetSelectionOnOptionHover={false}
      transitionProps={{ transition: "fade", duration: 100, timingFunction: "ease" }}
    >
      <Combobox.Target>
        <InputBase
          {...others}
          placeholder={placeholder}
          leftSection={<IconSearch size={18} />}
          rightSection={rightSection}
          rightSectionPointerEvents={showClear ? "auto" : "none"}
          value={search}
          disabled={disabled}
          loading={loading}
          onChange={(event) => {
            combobox.openDropdown();
            onSearchChange(event.currentTarget.value);
          }}
          onClick={() => combobox.openDropdown()}
          onFocus={() => combobox.openDropdown()}
          onBlur={() => combobox.closeDropdown()}
        />
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Options>
          {options.length === 0 ? (
            <Combobox.Empty>{emptyText}</Combobox.Empty>
          ) : (
            <ScrollArea.Autosize
              mah={200}
              type="scroll"
              scrollbarSize={4}
              viewportRef={setScrollParent}
              onMouseDown={(event) => event.preventDefault()}
            >
              {optionsList}
            </ScrollArea.Autosize>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
