import { Container, TypographyStylesProvider } from "@mantine/core";
import classes from "../Page.module.css"
import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function Docs() {
  const [markdown, setMarkdown] = useState("");
  const params = useParams();

  useEffect(() => {
    import(`../../../public/docs/${params.page}.md`).then(res => {
      fetch(res.default)
        .then(response => response.text())
        .then(text => {
          setMarkdown(text);
        });
    });
  }, []);

  return (
    <>
      <Container className={classes.root}>
        <TypographyStylesProvider p={0}>
          <Markdown remarkPlugins={[remarkGfm]}>{markdown}</Markdown>
        </TypographyStylesProvider>
      </Container>
    </>
  )
}