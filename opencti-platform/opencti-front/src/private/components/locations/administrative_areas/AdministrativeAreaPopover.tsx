import React, { useState } from 'react';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import MoreVert from '@mui/icons-material/MoreVert';
import { graphql, useMutation } from 'react-relay';
import { useNavigate } from 'react-router-dom-v5-compat';
import { PopoverProps } from '@mui/material/Popover';
import { useFormatter } from '../../../../components/i18n';
import AdministrativeAreaEditionContainer, { administrativeAreaEditionQuery } from './AdministrativeAreaEditionContainer';
import Security from '../../../../utils/Security';
import useQueryLoading from '../../../../utils/hooks/useQueryLoading';
import Transition from '../../../../components/Transition';
import { KNOWLEDGE_KNUPDATE_KNDELETE } from '../../../../utils/hooks/useGranted';
import { AdministrativeAreaEditionContainerQuery } from './__generated__/AdministrativeAreaEditionContainerQuery.graphql';
import useDeletion from '../../../../utils/hooks/useDeletion';

const AdministrativeAreaPopoverDeletionMutation = graphql`
  mutation AdministrativeAreaPopoverDeletionMutation($id: ID!) {
    administrativeAreaDelete(id: $id)
  }
`;

const AdministrativeAreaPopover = ({ id }: { id: string }) => {
  const { t_i18n } = useFormatter();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState<PopoverProps['anchorEl']>();
  const [displayEdit, setDisplayEdit] = useState<boolean>(false);
  const [commit] = useMutation(AdministrativeAreaPopoverDeletionMutation);
  const queryRef = useQueryLoading<AdministrativeAreaEditionContainerQuery>(
    administrativeAreaEditionQuery,
    { id },
  );
  const handleOpen = (event: React.SyntheticEvent) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(undefined);
  };
  const handleOpenEdit = () => {
    setDisplayEdit(true);
    handleClose();
  };
  const {
    deleting,
    handleOpenDelete,
    displayDelete,
    handleCloseDelete,
    setDeleting,
  } = useDeletion({ handleClose });
  const submitDelete = () => {
    setDeleting(true);
    commit({
      variables: {
        id,
      },
      onCompleted: () => {
        setDeleting(false);
        handleClose();
        navigate('/dashboard/locations/administrative_areas');
      },
    });
  };
  return (
    <>
      <IconButton
        onClick={handleOpen}
        aria-haspopup="true"
        style={{ marginTop: 3 }}
        size="large"
        color="primary"
      >
        <MoreVert />
      </IconButton>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleClose}>
        <MenuItem onClick={handleOpenEdit}>{t_i18n('Update')}</MenuItem>
        <Security needs={[KNOWLEDGE_KNUPDATE_KNDELETE]}>
          <MenuItem onClick={handleOpenDelete}>{t_i18n('Delete')}</MenuItem>
        </Security>
      </Menu>
      <Dialog
        PaperProps={{ elevation: 1 }}
        open={displayDelete}
        keepMounted={true}
        TransitionComponent={Transition}
        onClose={handleCloseDelete}
      >
        <DialogContent>
          <DialogContentText>
            {t_i18n('Do you want to delete this area?')}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDelete} disabled={deleting}>
            {t_i18n('Cancel')}
          </Button>
          <Button color="secondary" onClick={submitDelete} disabled={deleting}>
            {t_i18n('Delete')}
          </Button>
        </DialogActions>
      </Dialog>
      {queryRef && (
        <React.Suspense fallback={<div />}>
          <AdministrativeAreaEditionContainer
            queryRef={queryRef}
            handleClose={handleClose}
            open={displayEdit}
          />
        </React.Suspense>
      )}
    </>
  );
};

export default AdministrativeAreaPopover;
