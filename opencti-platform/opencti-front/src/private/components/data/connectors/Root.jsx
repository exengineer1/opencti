import React, { Component } from 'react';
import * as PropTypes from 'prop-types';
import { Route, withRouter } from 'react-router-dom';
import { QueryRenderer } from '../../../../relay/environment';
import Connector, { connectorQuery } from './Connector';
import Loader from '../../../../components/Loader';
import ErrorNotFound from '../../../../components/ErrorNotFound';

class RootConnector extends Component {
  render() {
    const {
      match: {
        params: { connectorId },
      },
    } = this.props;
    return (
      <div>
        <QueryRenderer
          query={connectorQuery}
          variables={{ id: connectorId }}
          render={({ props }) => {
            if (props) {
              if (props.connector) {
                return (
                  <div>
                    <Route
                      exact
                      path="/dashboard/data/ingestion/connectors/:connectorId"
                      render={(routeProps) => (
                        <Connector
                          {...routeProps}
                          connector={props.connector}
                        />
                      )}
                    />
                  </div>
                );
              }
              return <ErrorNotFound />;
            }
            return <Loader />;
          }}
        />
      </div>
    );
  }
}

RootConnector.propTypes = {
  children: PropTypes.node,
  match: PropTypes.object,
};

export default withRouter(RootConnector);
