import {
  ActionIcon, Alert, Anchor, Box, Center, Container, CopyButton, Flex, Group, Image, Loader, RenderTreeNodePayload,
  ScrollArea, Space, Text, Title, Tooltip, Tree, TreeNodeData, Typography, useTree
} from "@mantine/core";
import classes from "./Docs.module.css"
import React, { useEffect, useState } from "react";
import Markdown from "react-markdown";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkToc from "remark-toc";
import remarkHeadings from "@vcarl/remark-headings";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeRaw from "rehype-raw";
import remarkSlug from "remark-slug";
import remarkFlexibleContainers from "remark-flexible-containers";
import { useListState } from "@mantine/hooks";
import {
  IconAlertCircle, IconArrowLeft, IconCheck, IconChevronDown, IconCopy, IconInfoCircle, IconListSearch
} from "@tabler/icons-react";
import LazyLoad from 'react-lazyload';
import { PhotoView } from "react-photo-view";
import { CodeHighlight, CodeHighlightAdapterProvider, createShikiAdapter } from "@mantine/code-highlight";
import clsx from "clsx";
import { useData } from 'vike-react/useData';

async function loadShiki() {
  const { createHighlighterCore } = await import('@shikijs/core');
  const { createJavaScriptRegexEngine } = await import('@shikijs/engine-javascript');
  return await createHighlighterCore({
    langs: [
      import('@shikijs/langs/python'),
      import('@shikijs/langs/json'),
      import('@shikijs/langs/bash'),
    ],
    engine: createJavaScriptRegexEngine()
  });
}

const shikiAdapter = createShikiAdapter(loadShiki);

const scrollTo = (id: string) => {
  if (!id) return;

  if (typeof window !== 'undefined' && window.location.hash !== `#${encodeURIComponent(id)}`) {
    window.history.pushState(null, "", `${window.location.pathname}#${encodeURIComponent(id)}`);
  }

  const target = document.getElementById(id);
  const scrollArea = document.querySelector("#shell-root>.mantine-ScrollArea-root>.mantine-ScrollArea-viewport");

  if (target && scrollArea) {
    const offsetTop = target.offsetTop - parseInt(window.getComputedStyle(target).marginTop, 10);

    scrollArea.scrollTo({
      top: offsetTop,
      behavior: "smooth"
    });
  }
}

const getActiveElement = (rects: DOMRect[]) => {
  if (rects.length === 0) {
    return -1;
  }

  const closest = rects.reduce(
    (acc, item, index) => {
      if (Math.abs(acc.position) < Math.abs(item.y)) {
        return acc;
      }

      return {
        index,
        position: item.y,
      };
    },
    { index: 0, position: rects[0].y }
  );

  return closest.index;
}

const Leaf = ({ level, node, expanded, hasChildren, elementProps, tree }: RenderTreeNodePayload) => {
  useEffect(() => {
    if (level === 1) tree.expand(node.value);
  }, [level]);

  return (
    <div
      className={[elementProps.className, classes.tableOfContentsLink].join(" ")}
      data-selected={elementProps["data-selected"]}
      onClick={(event) => {
        event.preventDefault();
        scrollTo(node.value);
        elementProps.onClick?.(event);
      }}
    >
      <Group gap={5} ml="md">
        <span style={{ flex: 1 }}>{node.label}</span>

        {hasChildren && (
          <IconChevronDown
            size={14}
            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
          />
        )}
      </Group>
    </div>
  );
}

const TableOfContents = ({ headings }: any) => {
  const tree = useTree({
    multiple: false,
  });

  const [data, setData] = useState<TreeNodeData[]>([]);
  const [parentStack, setParentStack] = useState<TreeNodeData[]>([]);

  useEffect(() => {
    const data: TreeNodeData[] = [];
    const parentStack: TreeNodeData[] = [];

    headings.forEach((heading: any) => {
      const node: TreeNodeData = {
        label: heading.value,
        value: heading.data.id,
        children: []
      };

      if (heading.depth === 1) {
        data.push(node);
        parentStack.length = 0;
        parentStack.push(node);
      } else if (heading.depth < parentStack.length) {
        parentStack[heading.depth - 1] = node;
        parentStack.length = heading.depth;
        parentStack[heading.depth - 2].children?.push(node);
      } else {
        if (parentStack.length >= heading.depth) {
          parentStack[heading.depth - 1] = node;
        } else {
          parentStack.push(node);
        }

        if (parentStack.length >= 2) {
          const parent = parentStack[parentStack.length - 2];
          parent.children?.push(node);
        }
      }
    });

    setData(data);
    setParentStack(parentStack);
  }, [headings]);

  /*
   * 目录激活状态
   */
  const [active, setActive] = useState<number>(-1);
  const handleScroll = () => {
    const nodes = Array.from(document.querySelectorAll("#content :is(h1,h2,h3,h4,h5,h6)") as NodeListOf<HTMLElement>);
    if (nodes.length === 0) return;
    setActive(getActiveElement(nodes.map((node) => node.getBoundingClientRect())));
  }

  function findParentValue(node: TreeNodeData, targetValue: string): string | null {
    if (!node.children) return null;

    for (let child of node.children) {
      if (child.value === targetValue) {
        return node.value;
      }

      if (child.children) {
        const result = findParentValue(child, targetValue);
        if (result !== null) {
          return result;
        }
      }
    }

    return null;
  }

  useEffect(() => {
    if (active === -1) return;

    const nodes = Array.from(document.querySelectorAll("#content :is(h1,h2,h3,h4,h5,h6)"));
    if (nodes.length === 0) return;
    const id = nodes[active].id;

    tree.select(id);

    parentStack.forEach((node) => {
      if (node.value === id) return;

      let parentValue = findParentValue(node, id);

      if (parentValue && tree.expandedState[parentValue]) {
        return;
      }

      while (parentValue) {
        const lastParentValue = parentValue;
        parentValue = findParentValue(node, parentValue);

        if (parentValue && tree.expandedState[parentValue]) {
          tree.select(lastParentValue);
          break;
        }
      }
    });
  }, [active]);

  useEffect(() => {
    handleScroll();
  }, [data]);

  useEffect(() => {
    const scrollArea = document.querySelector(
      "#shell-root>.mantine-ScrollArea-root>.mantine-ScrollArea-viewport"
    )

    if (!scrollArea) return;

    scrollArea.addEventListener('scroll', handleScroll);

    return () => {
      scrollArea.removeEventListener('scroll', handleScroll);
    };
  }, []);

  return (
    <ScrollArea h="100%" type="never">
      <Group mb="md" mt="2rem">
        <IconListSearch size={18} stroke={1.5} />
        <Text mb={0}>目录</Text>
      </Group>
      <Tree data={data} tree={tree} levelOffset="md" renderNode={(payload) => <Leaf {...payload} />} />
      <Space h="2rem" />
    </ScrollArea>
  );
}

const Content = ({ markdown }: { markdown: string }) => {
  return (
    <Markdown
      remarkPlugins={[remarkGfm, remarkFlexibleContainers]}
      rehypePlugins={[
        rehypeSlug,
        rehypeRaw,
        [rehypeAutolinkHeadings, {
          behavior: 'wrap',
          properties: {
            className: classes.sectionHeading,
          },
        }]
      ]}
      components={{
        p({ children }) {
          return <Text className={classes.paragraph}>{children}</Text>;
        },
        a({ children, href, ...props }) {
          if (href && href.startsWith("http")) {
            return (
              <a className={clsx(classes.link, {
                [classes.externalLink]: typeof children === "string"
              })} href={href} target="_blank" rel="noreferrer" {...props}>
                {children}
              </a>
            );
          }
          return (
            <a className={classes.link} href={href} onClick={(event) => {
              if (href && href.startsWith("#")) {
                event.preventDefault();
                scrollTo(decodeURIComponent(href.slice(1)));
                return;
              }
              // 对于其他链接，使用默认行为
            }} {...props}>
              {children}
            </a>
          );
        },
        h1({ children, ...props }: any) {
          return <Title className={classes.heading1} {...props}>{children}</Title>;
        },
        h2({ children, ...props }: any) {
          return <Title order={2} className={classes.heading2} {...props}>{children}</Title>;
        },
        h3({ children, ...props }: any) {
          return <Title order={3} className={classes.heading3} {...props}>{children}</Title>;
        },
        h4({ children, ...props }: any) {
          return <Title order={4} className={classes.heading4} {...props}>{children}</Title>;
        },
        h5({ children, ...props }: any) {
          return <Title order={5} className={classes.heading5} {...props}>{children}</Title>;
        },
        h6({ children, ...props }: any) {
          return <Title order={6} className={classes.heading6} {...props}>{children}</Title>;
        },
        img({ src, ...props }: any) {
          return (
            <LazyLoad overflow debounce={100} placeholder={<Loader />}>
              <PhotoView src={src}>
                <Image radius="md" w="auto" src={src} {...props} />
              </PhotoView>
            </LazyLoad>
          );
        },
        ul({ children }) {
          return <ul className={classes.list}>{children}</ul>;
        },
        ol({ children }) {
          return <ol className={classes.list}>{children}</ol>;
        },
        li({ children }) {
          return <li className={classes.listItem}>{children}</li>;
        },
        div({ className, children, ...props }) {
          const classesName = className ? className.split(" ") : [];

          if (classesName.includes("remark-container")) {
            let icon = <IconInfoCircle />;
            let color = "blue";
            if (classesName.includes("warning")) {
              icon = <IconAlertCircle />;
              color = "yellow";
            }
            if (classesName.includes("danger")) {
              icon = <IconAlertCircle />;
              color = "red";
            }

            const childrenArray = React.Children.toArray(children);
            const titleChild = childrenArray.find(
              child => React.isValidElement(child) && child.props.className?.includes('remark-container-title')
            ) as React.ReactElement;

            return <Alert
              className={classes.alert}
              radius="md"
              mt="md"
              variant="light"
              color={color}
              title={titleChild?.props.children}
              icon={icon}
              styles={{
                body: {
                  width: "0",
                }
              }}
            >
              {childrenArray.filter(
                (child) => !React.isValidElement(child) || !child.props.className?.includes('remark-container-title')
              )}
            </Alert>
          }
          return <div className={className} {...props}>{children}</div>;
        },
        th({ children, ...props }) {
          return <th className={classes.tableCell} {...props}>{children}</th>;
        },
        td({ children, ...props }) {
          return <td className={classes.tableCell} {...props}>{children}</td>;
        },
        pre({ children }: any) {
          return <div className={classes.codeBlock}>
            <CopyButton value={children.props.children} timeout={2000}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? '已复制' : '复制代码块'} withArrow>
                  <ActionIcon className={classes.codeBlockCopyButton} color={copied ? 'teal' : 'gray'} variant="subtle" onClick={copy}>
                    {copied ? (
                      <IconCheck width={16} />
                    ) : (
                      <IconCopy width={16} />
                    )}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
            <CodeHighlight
              code={children.props.children}
              language={children.props.className?.replace("language-", "") || "text"}
              withCopyButton={false}
              styles={{
                pre: {
                  overflow: "unset",
                  width: "0",
                },
              }}
              radius="md"
            />
          </div>
        },
        code({ children }) {
          return <span className={classes.code}>{children}</span>
        },
        blockquote({ children }) {
          return <Text className={classes.blockQuote}>{children}</Text>
        }
      }}
    >
      {markdown}
    </Markdown>
  )
}

export default function Page() {
  const data = useData<{ markdown: string; slug: string }>();
  const { markdown, slug } = data;
  const [headings, handlers] = useListState([]);

  useEffect(() => {
    if (!markdown) return;

    const file = remark()
      .use(remarkToc)
      .use(remarkSlug as any)
      .use(remarkHeadings)
      .processSync(markdown);

    handlers.setState(file.data.headings as any);

    // 处理 URL hash 滚动
    if (typeof window !== 'undefined' && window.location.hash) {
      setTimeout(() => {
        scrollTo(decodeURIComponent(window.location.hash.slice(1)));
      }, 100);
    }
  }, [markdown]);

  if (!markdown) {
    return (
      <Group justify="center" mt="xs">
        <Loader type="dots" size="xl" />
      </Group>
    );
  }

  return (
    <Flex>
      <Container mr={0} className={classes.content}>
        {slug && slug !== 'index' && (
          <Anchor href="/docs">
            <Center inline mt="xs">
              <IconArrowLeft size={18} />
              <Box component="span" ml={5}>
                返回文档首页
              </Box>
            </Center>
          </Anchor>
        )}
        <CodeHighlightAdapterProvider adapter={shikiAdapter}>
          <Typography id="content" p={0}>
            <Content markdown={markdown} />
          </Typography>
        </CodeHighlightAdapterProvider>
      </Container>
      <Container ml={0} className={classes.tableOfContents}>
        <TableOfContents headings={headings} />
      </Container>
    </Flex>
  )
}
