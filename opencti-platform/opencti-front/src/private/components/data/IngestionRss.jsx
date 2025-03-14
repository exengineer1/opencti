import React from 'react';
import Alert from '@mui/material/Alert';
import makeStyles from '@mui/styles/makeStyles';
import { QueryRenderer } from '../../../relay/environment';
import ListLines from '../../../components/list_lines/ListLines';
import IngestionRssLines, { IngestionRssLinesQuery } from './ingestionRss/IngestionRssLines';
import IngestionRssCreation from './ingestionRss/IngestionRssCreation';
import { usePaginationLocalStorage } from '../../../utils/hooks/useLocalStorage';
import useAuth from '../../../utils/hooks/useAuth';
import { useFormatter } from '../../../components/i18n';
import { INGESTION_MANAGER } from '../../../utils/platformModulesHelper';
import IngestionMenu from './IngestionMenu';

const LOCAL_STORAGE_KEY = 'ingestionRss';

const useStyles = makeStyles(() => ({
  container: {
    margin: 0,
    padding: '0 200px 50px 0',
  },
}));

const IngestionRss = () => {
  const classes = useStyles();
  const { t_i18n } = useFormatter();
  const { platformModuleHelpers } = useAuth();
  const {
    viewStorage,
    paginationOptions,
    helpers: storageHelpers,
  } = usePaginationLocalStorage(LOCAL_STORAGE_KEY, {
    sortBy: 'name',
    orderAsc: false,
    searchTerm: '',
  });
  const dataColumns = {
    name: {
      label: 'Name',
      width: '20%',
      isSortable: true,
    },
    uri: {
      label: 'URL',
      width: '30%',
      isSortable: true,
    },
    ingestion_running: {
      label: 'Running',
      width: '20%',
      isSortable: false,
    },
    current_state_date: {
      label: 'Current state',
      isSortable: false,
      width: '15%',
    },
  };
  if (!platformModuleHelpers.isIngestionManagerEnable()) {
    return (
      <Alert severity="info">
        {t_i18n(platformModuleHelpers.generateDisableMessage(INGESTION_MANAGER))}
      </Alert>
    );
  }
  return (
    <div className={classes.container}>
      <IngestionMenu/>
      <ListLines
        helpers={storageHelpers}
        sortBy={viewStorage.sortBy}
        orderAsc={viewStorage.orderAsc}
        dataColumns={dataColumns}
        handleSort={storageHelpers.handleSort}
        handleSearch={storageHelpers.handleSearch}
        displayImport={false}
        secondaryAction={true}
        keyword={viewStorage.searchTerm}
      >
        <QueryRenderer
          query={IngestionRssLinesQuery}
          variables={{ count: 200, ...paginationOptions }}
          render={({ props }) => (
            <IngestionRssLines
              data={props}
              paginationOptions={paginationOptions}
              refetchPaginationOptions={{ count: 200, ...paginationOptions }}
              dataColumns={dataColumns}
              initialLoading={props === null}
            />
          )}
        />
      </ListLines>
      <IngestionRssCreation paginationOptions={paginationOptions}/>
    </div>
  );
};

export default IngestionRss;
