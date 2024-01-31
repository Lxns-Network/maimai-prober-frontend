import { Container, Flex, Group, NavLink, ScrollArea, Space, Text, TypographyStylesProvider } from "@mantine/core";
import classes from "./Docs.module.css"
import { useNavigate, useParams } from "react-router-dom";
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
import { IconListSearch } from "@tabler/icons-react";

const scrollTo = (id: string) => {
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
      <Group mb="md" mt={49.6}>
        <IconListSearch size={18} stroke={1.5} />
        <Text mb={0}>目录</Text>
      </Group>
      {headings.map((heading: any) => (
        heading.depth !== 1 && <NavLink
          className={classes.link}
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
      <Space h="md" />
    </ScrollArea>
  );
}

export default function Docs() {
  const { "*": page } = useParams();
  const [markdown, setMarkdown] = useState("");
  const [headings, handlers] = useListState([]);
  const navigate = useNavigate();

  useEffect(() => {
    let route = "/docs";
    page?.split("/").forEach((part) => {
      route += `/${part || "index"}`;
    });
    route += ".md";
    fetch(route).then(response => response.text()).then(text => {
      setMarkdown(text);
    }).catch(() => {
      navigate("/404");
    });
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
        <TypographyStylesProvider p={0}>
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
              pre({ children }) {
                return <div className={classes.codeBlock}>{children}</div>
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
        </TypographyStylesProvider>
      </Container>
      <Container ml={0} className={classes.tableOfContents}>
        <TableOfContents headings={headings} />
      </Container>
    </Flex>
  )
}