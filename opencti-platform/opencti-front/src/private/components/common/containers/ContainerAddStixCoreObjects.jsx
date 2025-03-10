import React, { useRef, useState } from 'react';
import IconButton from '@mui/material/IconButton';
import Fab from '@mui/material/Fab';
import { Add } from '@mui/icons-material';
import Tooltip from '@mui/material/Tooltip';
import SpeedDial from '@mui/material/SpeedDial';
import SpeedDialIcon from '@mui/material/SpeedDialIcon';
import SpeedDialAction from '@mui/material/SpeedDialAction';
import { GlobeModel, HexagonOutline } from 'mdi-material-ui';
import makeStyles from '@mui/styles/makeStyles';
import { QueryRenderer } from '../../../../relay/environment';
import { useFormatter } from '../../../../components/i18n';
import ContainerAddStixCoreObjectsLines, { containerAddStixCoreObjectsLinesQuery } from './ContainerAddStixCoreObjectsLines';
import StixDomainObjectCreation from '../stix_domain_objects/StixDomainObjectCreation';
import StixCyberObservableCreation from '../../observations/stix_cyber_observables/StixCyberObservableCreation';
import { stixCyberObservableTypes, stixDomainObjectTypes } from '../../../../utils/hooks/useAttributes';
import { UserContext } from '../../../../utils/hooks/useAuth';
import ListLines from '../../../../components/list_lines/ListLines';
import { constructHandleAddFilter, constructHandleRemoveFilter, filtersAfterSwitchLocalMode, emptyFilterGroup } from '../../../../utils/filters/filtersUtils';
import Drawer from '../drawer/Drawer';

const useStyles = makeStyles((theme) => ({
  createButton: {
    position: 'fixed',
    bottom: 30,
    right: 30,
    zIndex: 1100,
  },
  createButtonWithPadding: {
    position: 'fixed',
    bottom: 30,
    right: 280,
    zIndex: 1100,
  },
  createButtonSimple: {
    float: 'left',
    marginTop: -15,
  },
  speedDial: {
    position: 'fixed',
    bottom: 30,
    right: 30,
    zIndex: 2000,
  },
  speedDialButton: {
    backgroundColor: theme.palette.secondary.main,
    color: '#ffffff',
    '&:hover': {
      backgroundColor: theme.palette.secondary.main,
    },
  },
}));

const ContainerAddStixCoreObjects = (props) => {
  const {
    targetStixCoreObjectTypes,
    defaultCreatedBy,
    defaultMarkingDefinitions,
    containerId,
    knowledgeGraph,
    containerStixCoreObjects,
    confidence,
    withPadding,
    simple,
    paginationOptions,
    onAdd,
    onDelete,
    mapping,
    selectedText,
    openDrawer,
    handleClose,
  } = props;
  const classes = useStyles();
  const { t_i18n } = useFormatter();
  const [open, setOpen] = useState(false);
  const [openSpeedDial, setOpenSpeedDial] = useState(false);
  const [openCreateEntity, setOpenCreateEntity] = useState(false);
  const [openCreateObservable, setOpenCreateObservable] = useState(false);
  const [sortBy, setSortBy] = useState('_score');
  const [orderAsc, setOrderAsc] = useState(false);

  const targetEntityTypesFilterGroup = {
    mode: 'and',
    filterGroups: [],
    filters: [
      {
        key: 'entity_type',
        values: targetStixCoreObjectTypes,
        operator: 'eq',
        mode: 'or',
      },
    ],
  };

  const [filters, setFilters] = useState(
    targetStixCoreObjectTypes
    && !(targetStixCoreObjectTypes.includes('Stix-Domain-Object') || targetStixCoreObjectTypes.includes('Stix-Cyber-Observable'))
      ? targetEntityTypesFilterGroup
      : emptyFilterGroup,
  );
  const [numberOfElements, setNumberOfElements] = useState({
    number: 0,
    symbol: '',
  });
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef(null);
  const handleOpenCreateEntity = () => {
    setOpenCreateEntity(true);
    setOpenSpeedDial(false);
  };
  const handleCloseCreateEntity = () => {
    setOpenCreateEntity(false);
    setOpenSpeedDial(false);
  };
  const handleOpenCreateObservable = () => {
    setOpenCreateObservable(true);
    setOpenSpeedDial(false);
  };
  const handleCloseCreateObservable = () => {
    setOpenCreateObservable(false);
    setOpenSpeedDial(false);
  };
  const handleSort = (field, sortOrderAsc) => {
    setSortBy(field);
    setOrderAsc(sortOrderAsc);
  };
  const handleAddFilter = (key, id, op = 'eq', event = null) => {
    if (event) {
      event.stopPropagation();
      event.preventDefault();
    }
    setFilters(constructHandleAddFilter(filters, key, id, op));
  };
  const handleRemoveFilter = (key, op = 'eq') => {
    setFilters(constructHandleRemoveFilter(filters, key, op));
  };

  const handleSwitchLocalMode = (localFilter) => {
    setFilters(filtersAfterSwitchLocalMode(filters, localFilter));
  };

  const handleSwitchGlobalMode = () => {
    if (filters) {
      setFilters({
        ...filters,
        mode: filters.mode === 'and' ? 'or' : 'and',
      });
    }
  };
  const isTypeDomainObject = (types) => {
    return !types || types.some((r) => stixDomainObjectTypes.indexOf(r) >= 0);
  };
  const isTypeObservable = (types) => {
    return (
      !types || types.some((r) => stixCyberObservableTypes.indexOf(r) >= 0)
    );
  };
  const renderDomainObjectCreation = (searchPaginationOptions) => {
    return (
      <StixDomainObjectCreation
        display={open}
        inputValue={mapping && searchTerm.length === 0 ? selectedText : searchTerm}
        paginationKey="Pagination_stixCoreObjects"
        paginationOptions={searchPaginationOptions}
        confidence={confidence}
        defaultCreatedBy={defaultCreatedBy}
        defaultMarkingDefinitions={defaultMarkingDefinitions}
        stixDomainObjectTypes={
                    targetStixCoreObjectTypes && targetStixCoreObjectTypes.length > 0
                      ? targetStixCoreObjectTypes
                      : []
                }
      />
    );
  };
  const renderObservableCreation = (searchPaginationOptions) => {
    return (
      <StixCyberObservableCreation
        display={open}
        contextual={true}
        inputValue={mapping && searchTerm.length === 0 ? selectedText : searchTerm}
        paginationKey="Pagination_stixCoreObjects"
        paginationOptions={searchPaginationOptions}
        defaultCreatedBy={defaultCreatedBy}
        defaultMarkingDefinitions={defaultMarkingDefinitions}
      />
    );
  };
  const renderStixCoreObjectCreation = (searchPaginationOptions) => {
    return (
      <>
        <SpeedDial
          className={classes.createButton}
          ariaLabel="Create"
          icon={<SpeedDialIcon/>}
          onClose={() => setOpenSpeedDial(false)}
          onOpen={() => setOpenSpeedDial(true)}
          open={openSpeedDial}
          FabProps={{
            color: 'secondary',
          }}
        >
          <SpeedDialAction
            title={t_i18n('Create an observable')}
            icon={<HexagonOutline/>}
            tooltipTitle={t_i18n('Create an observable')}
            onClick={() => handleOpenCreateObservable()}
            FabProps={{
              classes: { root: classes.speedDialButton },
            }}
          />
          <SpeedDialAction
            title={t_i18n('Create an entity')}
            icon={<GlobeModel/>}
            tooltipTitle={t_i18n('Create an entity')}
            onClick={() => handleOpenCreateEntity()}
            FabProps={{
              classes: { root: classes.speedDialButton },
            }}
          />
        </SpeedDial>
        <StixDomainObjectCreation
          display={open}
          inputValue={mapping && searchTerm.length === 0 ? selectedText : searchTerm}
          paginationKey="Pagination_stixCoreObjects"
          paginationOptions={searchPaginationOptions}
          confidence={confidence}
          defaultCreatedBy={defaultCreatedBy}
          defaultMarkingDefinitions={defaultMarkingDefinitions}
          stixCoreObjectTypes={
                        targetStixCoreObjectTypes && targetStixCoreObjectTypes.length > 0
                          ? targetStixCoreObjectTypes
                          : []
                    }
          speeddial={true}
          open={openCreateEntity}
          handleClose={() => handleCloseCreateEntity()}
        />
        <StixCyberObservableCreation
          display={open}
          contextual={true}
          inputValue={mapping && searchTerm.length === 0 ? selectedText : searchTerm}
          paginationKey="Pagination_stixCoreObjects"
          paginationOptions={searchPaginationOptions}
          defaultCreatedBy={defaultCreatedBy}
          defaultMarkingDefinitions={defaultMarkingDefinitions}
          speeddial={true}
          open={openCreateObservable}
          handleClose={() => handleCloseCreateObservable()}
        />
      </>
    );
  };
  const resolveAvailableTypes = () => {
    if (
      targetStixCoreObjectTypes
            && isTypeDomainObject(targetStixCoreObjectTypes)
            && !isTypeObservable(targetStixCoreObjectTypes)
    ) {
      return 'Stix-Domain-Object';
    }
    if (
      targetStixCoreObjectTypes
            && isTypeObservable(targetStixCoreObjectTypes)
            && !isTypeDomainObject(targetStixCoreObjectTypes)
    ) {
      return 'Stix-Cyber-Observable';
    }
    if (
      !targetStixCoreObjectTypes
            || (isTypeObservable(targetStixCoreObjectTypes)
                && isTypeDomainObject(targetStixCoreObjectTypes))
    ) {
      return 'Stix-Core-Object';
    }
    return null;
  };
  const renderEntityCreation = (searchPaginationOptions) => {
    if (
      targetStixCoreObjectTypes
            && isTypeDomainObject(targetStixCoreObjectTypes)
            && !isTypeObservable(targetStixCoreObjectTypes)
    ) {
      return renderDomainObjectCreation(searchPaginationOptions);
    }
    if (
      targetStixCoreObjectTypes
            && isTypeObservable(targetStixCoreObjectTypes)
            && !isTypeDomainObject(targetStixCoreObjectTypes)
    ) {
      return renderObservableCreation(searchPaginationOptions);
    }
    if (
      !targetStixCoreObjectTypes
            || (isTypeObservable(targetStixCoreObjectTypes)
                && isTypeDomainObject(targetStixCoreObjectTypes))
    ) {
      return renderStixCoreObjectCreation(searchPaginationOptions);
    }
    return null;
  };
  const buildColumns = (platformModuleHelpers) => {
    const isRuntimeSort = platformModuleHelpers.isRuntimeFieldEnable();
    return {
      entity_type: {
        label: 'Type',
        width: '15%',
        isSortable: true,
      },
      value: {
        label: 'Value',
        width: '32%',
        isSortable: false,
      },
      createdBy: {
        label: 'Author',
        width: '15%',
        isSortable: isRuntimeSort,
      },
      objectLabel: {
        label: 'Labels',
        width: '22%',
        isSortable: false,
      },
      objectMarking: {
        label: 'Marking',
        width: '15%',
        isSortable: isRuntimeSort,
      },
    };
  };
  const renderSearchResults = (searchPaginationOptions) => {
    return (
      <UserContext.Consumer>
        {({ platformModuleHelpers }) => (
          <ListLines
            sortBy={sortBy}
            orderAsc={orderAsc}
            dataColumns={buildColumns(platformModuleHelpers)}
            handleSearch={setSearchTerm}
            keyword={mapping && searchTerm.length === 0 ? selectedText : searchTerm}
            handleSort={handleSort}
            handleAddFilter={handleAddFilter}
            handleRemoveFilter={handleRemoveFilter}
            handleSwitchLocalMode={handleSwitchLocalMode}
            handleSwitchGlobalMode={handleSwitchGlobalMode}
            disableCards={true}
            filters={filters}
            paginationOptions={searchPaginationOptions}
            numberOfElements={numberOfElements}
            iconExtension={true}
            parametersWithPadding={true}
            disableExport={true}
            availableEntityTypes={[resolveAvailableTypes()]}
            availableFilterKeys={[
              'entity_type',
              'objectMarking',
              'objectLabel',
              'createdBy',
              'confidence',
              'x_opencti_organization_type',
              'created',
              'created_at',
              'creator_id',
            ]}
          >
            <QueryRenderer
              query={containerAddStixCoreObjectsLinesQuery}
              variables={{ count: 100, ...searchPaginationOptions }}
              render={({ props: renderProps }) => (
                <ContainerAddStixCoreObjectsLines
                  data={renderProps}
                  containerId={containerId}
                  paginationOptions={paginationOptions}
                  dataColumns={buildColumns(platformModuleHelpers)}
                  initialLoading={renderProps === null}
                  knowledgeGraph={knowledgeGraph}
                  containerStixCoreObjects={containerStixCoreObjects}
                  onAdd={onAdd}
                  onDelete={onDelete}
                  setNumberOfElements={setNumberOfElements}
                  mapping={mapping}
                  containerRef={containerRef}
                />
              )}
            />
          </ListLines>
        )}
      </UserContext.Consumer>
    );
  };
  const searchPaginationOptions = {
    types: [resolveAvailableTypes()],
    search: mapping && searchTerm.length === 0 ? selectedText : searchTerm,
    filters,
    orderBy: sortBy,
    orderMode: orderAsc ? 'asc' : 'desc',
  };
  const renderButton = () => {
    if (knowledgeGraph) {
      return (
        <Tooltip title={t_i18n('Add an entity to this container')}>
          <IconButton
            color="primary"
            aria-label="Add"
            onClick={() => setOpen(true)}
            size="large"
          >
            <Add/>
          </IconButton>
        </Tooltip>
      );
    }
    if (simple) {
      return (
        <IconButton
          color="primary"
          aria-label="Add"
          onClick={() => setOpen(true)}
          classes={{ root: classes.createButtonSimple }}
          size="large"
        >
          <Add fontSize="small"/>
        </IconButton>
      );
    }
    return (
      <Fab
        onClick={() => setOpen(true)}
        color="secondary"
        aria-label="Add"
        className={withPadding ? classes.createButtonWithPadding : classes.createButton}
      >
        <Add/>
      </Fab>
    );
  };
  const resetState = () => {
    setSearchTerm('');
    setFilters(
      targetStixCoreObjectTypes
            && !(targetStixCoreObjectTypes.includes('Stix-Domain-Object') || targetStixCoreObjectTypes.includes('Stix-Cyber-Observable'))
        ? targetEntityTypesFilterGroup
        : emptyFilterGroup,
    );
  };
  return (
    <>
      {!mapping && renderButton()}
      <Drawer
        open={mapping ? openDrawer : open}
        onClose={() => {
          resetState();
          if (mapping) {
            handleClose();
          } else {
            setOpen(false);
          }
        }}
        title={t_i18n('Add entities')}
        containerRef={containerRef}
      >
        <>
          {renderSearchResults(searchPaginationOptions)}
          {renderEntityCreation(searchPaginationOptions)}
        </>
      </Drawer>
    </>
  );
};

export default ContainerAddStixCoreObjects;
