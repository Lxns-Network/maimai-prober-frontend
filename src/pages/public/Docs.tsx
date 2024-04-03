import {
  ActionIcon,
  Container,
  CopyButton,
  Flex,
  Group, Loader,
  NavLink,
  ScrollArea,
  Space,
  Text,
  Title,
  Tooltip,
  TypographyStylesProvider,
  Image, Box, Center, Anchor
} from "@mantine/core";
import classes from "./Docs.module.css"
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkToc from "remark-toc";
import remarkHeadings from "@vcarl/remark-headings";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import remarkSlug from "remark-slug";
import remarkFlexibleContainers from "remark-flexible-containers";
import { useListState } from "@mantine/hooks";
import { IconArrowLeft, IconCheck, IconCopy, IconListSearch } from "@tabler/icons-react";
import LazyLoad from 'react-lazyload';
import { PhotoView } from "react-photo-view";

const scrollTo = (id: string) => {
  if (!id) return;

  window.history.pushState(null, "", `${window.location.pathname}#${encodeURIComponent(id)}`);

  const target = document.getElementById(id);
  const scrollArea = document.querySelector("#root>.mantine-ScrollArea-root>.mantine-ScrollArea-viewport");

  if (target && scrollArea) {
    const offsetTop = target.offsetTop - parseInt(window.getComputedStyle(target).marginTop, 10);

    scrollArea.scrollTo({
      top: offsetTop,
      behavior: "smooth"
    });
  }
}

const TableOfContents = ({ headings }: any) => {
  return (
    <ScrollArea h="100%" type="never">
      <Group mb="md" mt="2rem">
        <IconListSearch size={18} stroke={1.5} />
        <Text mb={0}>目录</Text>
      </Group>
      {headings.map((heading: any) => (
        heading.depth !== 1 && <NavLink
          className={classes.tableOfContentsLink}
          data-heading={heading.depth}
          key={heading.data.id}
          href={`#${heading.data.id}`}
          label={heading.value}
          style={{ paddingLeft: `calc(${heading.depth-1} * var(--mantine-spacing-md))` }}
          onClick={(event) => {
            event.preventDefault();
            scrollTo(heading.data.id);
          }}
        />
      ))}
      <Space h="2rem" />
    </ScrollArea>
  );
}

const Content = ({ markdown }: { markdown: string }) => {
  const navigate = useNavigate();

  return (
    <Markdown
      remarkPlugins={[remarkGfm, remarkFlexibleContainers]}
      rehypePlugins={[
        rehypeSlug,
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
            return <a className={classes.externalLink} href={href} target="_blank" rel="noreferrer" {...props}>
              {children}
            </a>;
          }
          return <a href={href} onClick={(event) => {
            event.preventDefault();
            if (href && href.startsWith("#")) {
              scrollTo(href.slice(1));
              return;
            }
            href && navigate(href);
          }} {...props}>
            {children}
          </a>;
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
        div({ className, children, ...props }) {
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
            {children}
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

export default function Docs() {
  const { "*": page } = useParams();
  const [markdown, setMarkdown] = useState("");
  const [headings, handlers] = useListState([]);
  const navigate = useNavigate();
  const location = useLocation();

  const pageHandler = async (page: string) => {
    const fetchPage = async (path: string) => {
      const response = await fetch(path);
      if (response.ok) {
        return await response.text();
      }
      return null;
    };

    const text = await fetchPage(`/docs/${page}.md`) || await fetchPage(`/docs/${page}/index.md`);
    if (!text) {
      navigate("/404");
      return;
    }

    setMarkdown(text);
  }

  useEffect(() => {
    setMarkdown("");
    pageHandler(page || "index");
  }, [page]);

  useEffect(() => {
    const file = remark()
      .use(remarkToc)
      .use(remarkSlug as any)
      .use(remarkHeadings)
      .processSync(markdown);

    handlers.setState(file.data.headings as any);

    (file.data.headings as any).forEach((heading: any) => {
      if (heading.depth === 1) {
        document.title = `${heading.value} | maimai DX 查分器`;
      }
    });

    scrollTo(decodeURIComponent(location.hash.slice(1)));
  }, [markdown]);

  return (
    <Flex>
      <Container mr={0} className={classes.content}>
        {markdown && page && (
          <Anchor component={Link} to="/docs">
            <Center inline mt="xs">
              <IconArrowLeft size={18} />
              <Box component="span" ml={5}>
                返回文档首页
              </Box>
            </Center>
          </Anchor>
        )}
        {!markdown ? (
          <Group justify="center" mt="xs">
            <Loader type="dots" size="xl" />
          </Group>
        ) : (
          <TypographyStylesProvider p={0}>
            <Content markdown={markdown} />
          </TypographyStylesProvider>
        )}
      </Container>
      <Container ml={0} className={classes.tableOfContents}>
        <TableOfContents headings={headings} />
      </Container>
    </Flex>
  )
}