import { Container, Flex, Group, NavLink, ScrollArea, Space, Text, TypographyStylesProvider } from "@mantine/core";
import classes from "./Docs.module.css"
import { useLocation, useNavigate, useParams } from "react-router-dom";
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
      <Space h="md" />
    </ScrollArea>
  );
}

export default function Docs() {
  const { "*": page } = useParams();
  const [markdown, setMarkdown] = useState("");
  const [headings, handlers] = useListState([]);
  const navigate = useNavigate();
  const location = useLocation();

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

  useEffect(() => {
    scrollTo(decodeURIComponent(location.hash.slice(1)));
  }, [location]);

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
              a({ children, href, ...props }) {
                if (href && href.startsWith("http")) {
                  return <a className={classes.externalLink} href={href} target="_blank" rel="noreferrer" {...props}>{children}</a>;
                }
                return <a href={href} onClick={(event) => {
                  event.preventDefault();
                  if (href) navigate(href);
                }} {...props}>{children}</a>;
              },
              h1({ children, ...props }) {
                return <h1 className={classes.heading1} {...props}>{children}</h1>;
              },
              h2({ children, ...props }) {
                return <h2 className={classes.heading2} {...props}>{children}</h2>;
              },
              h3({ children, ...props }) {
                  return <h3 className={classes.heading3} {...props}>{children}</h3>;
              },
              h4({ children, ...props }) {
                return <h4 className={classes.heading4} {...props}>{children}</h4>;
              },
              h5({ children, ...props }) {
                  return <h5 className={classes.heading5} {...props}>{children}</h5>;
              },
              h6({ children, ...props }) {
                  return <h6 className={classes.heading6} {...props}>{children}</h6>;
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