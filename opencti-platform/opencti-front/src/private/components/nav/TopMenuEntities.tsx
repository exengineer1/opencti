import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import Button from '@mui/material/Button';
import { AccountBalanceOutlined, DomainOutlined, EventOutlined, PersonOutlined, StorageOutlined } from '@mui/icons-material';
import makeStyles from '@mui/styles/makeStyles';
import { Theme } from '@mui/material/styles/createTheme';
import { useFormatter } from '../../../components/i18n';
import { useIsHiddenEntity } from '../../../utils/hooks/useEntitySettings';

const useStyles = makeStyles<Theme>((theme) => ({
  button: {
    marginRight: theme.spacing(2),
    padding: '0 5px 0 5px',
    minHeight: 20,
    minWidth: 20,
    textTransform: 'none',
  },
  icon: {
    marginRight: theme.spacing(1),
  },
}));

const TopMenuEntities = () => {
  const { t_i18n } = useFormatter();
  const location = useLocation();
  const classes = useStyles();
  return (
    <>
      {!useIsHiddenEntity('Sector') && (
        <Button
          component={Link}
          to="/dashboard/entities/sectors"
          variant={
            location.pathname.includes('/dashboard/entities/sectors')
              ? 'contained'
              : 'text'
          }
          size="small"
          classes={{ root: classes.button }}
        >
          <DomainOutlined className={classes.icon} fontSize="small" />
          {t_i18n('Sectors')}
        </Button>
      )}
      {!useIsHiddenEntity('Event') && (
        <Button
          component={Link}
          to="/dashboard/entities/events"
          variant={
            location.pathname.includes('/dashboard/entities/events')
              ? 'contained'
              : 'text'
          }
          size="small"
          classes={{ root: classes.button }}
        >
          <EventOutlined className={classes.icon} fontSize="small" />
          {t_i18n('Events')}
        </Button>
      )}
      {!useIsHiddenEntity('Organization') && (
        <Button
          component={Link}
          to="/dashboard/entities/organizations"
          variant={
            location.pathname.includes('/dashboard/entities/organizations')
              ? 'contained'
              : 'text'
          }
          size="small"
          classes={{ root: classes.button }}
        >
          <AccountBalanceOutlined className={classes.icon} fontSize="small" />
          {t_i18n('Organizations')}
        </Button>
      )}
      {!useIsHiddenEntity('System') && (
        <Button
          component={Link}
          to="/dashboard/entities/systems"
          variant={
            location.pathname.includes('/dashboard/entities/systems')
              ? 'contained'
              : 'text'
          }
          size="small"
          classes={{ root: classes.button }}
        >
          <StorageOutlined className={classes.icon} fontSize="small" />
          {t_i18n('Systems')}
        </Button>
      )}
      {!useIsHiddenEntity('Individual') && (
        <Button
          component={Link}
          to="/dashboard/entities/individuals"
          variant={
            location.pathname.includes('/dashboard/entities/individuals')
              ? 'contained'
              : 'text'
          }
          size="small"
          classes={{ root: classes.button }}
        >
          <PersonOutlined className={classes.icon} fontSize="small" />
          {t_i18n('Individuals')}
        </Button>
      )}
    </>
  );
};

export default TopMenuEntities;
