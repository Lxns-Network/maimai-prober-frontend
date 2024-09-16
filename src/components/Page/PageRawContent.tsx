import { PageProps } from "./Page.tsx";
import classes from "./PageRawContent.module.css";

export const PageRawContent = (props: PageProps) => {
  return (
    <div className={classes.wrapper}>
      {props.children}
    </div>
  )
}