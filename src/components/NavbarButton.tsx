import { useNavigate } from "react-router-dom";
import Icon from "@mdi/react";
import { createStyles, getStylesRef } from "@mantine/core";

const useStyles = createStyles((theme) => ({
  link: {
    ...theme.fn.focusStyles(),
    display: 'flex',
    alignItems: 'center',
    textDecoration: 'none',
    fontSize: theme.fontSizes.sm,
    color: theme.colorScheme === 'dark' ? theme.colors.dark[1] : theme.colors.gray[7],
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    borderRadius: theme.radius.sm,
    fontWeight: 500,

    '&:hover': {
      backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[6] : theme.colors.gray[0],
      color: theme.colorScheme === 'dark' ? theme.white : theme.black,

      [`& .${getStylesRef('icon')}`]: {
        color: theme.colorScheme === 'dark' ? theme.white : theme.black,
      },
    },
  },

  linkIcon: {
    ref: getStylesRef('icon'),
    color: theme.colorScheme === 'dark' ? theme.colors.dark[2] : theme.colors.gray[6],
    marginRight: theme.spacing.sm,
  },

  linkActive: {
    '&, &:hover': {
      backgroundColor: theme.fn.variant({ variant: 'light', color: theme.primaryColor }).background,
      color: theme.fn.variant({ variant: 'light', color: theme.primaryColor }).color,
      [`& .${getStylesRef('icon')}`]: {
        color: theme.fn.variant({ variant: 'light', color: theme.primaryColor }).color,
      },
    },
  },
}));

interface NavbarButtonProps {
  label: string;
  icon: string;
  to?: string;
  active?: string;
  onClose(): void;
  onClick?(): void;
}

export const NavbarButton = ({ label, icon, to, active, onClose, onClick }: NavbarButtonProps) => {
  const { classes, cx } = useStyles();
  const navigate = useNavigate();

  return (
    <a href={to} key={label}
       className={cx(classes.link, { [classes.linkActive]: label === active })}
       onClick={(event) => {
         event.preventDefault();
         onClick && onClick();
         if (to) navigate(to);
         onClose();
       }}
    >
      <Icon className={classes.linkIcon} path={icon} size={1} />
      <span>{label}</span>
    </a>
  )
}