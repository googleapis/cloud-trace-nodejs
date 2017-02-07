'use strict';

var cls = require('../../../src/cls.js');
var shimmer = require('shimmer');
var SpanData = require('../../../src/span-data.js');

var SUPPORTED_VERSIONS = '^2.9.x';

function createQueryWrap(api, createQuery) {
  return function createQuery_trace(sql, values, cb) {
    var root = cls.getRootContext();
    if (!root) {
      return createQuery.apply(this, arguments);
    } else if (root === SpanData.nullSpan) {
      return createQuery.apply(this, arguments);
    }
    var span = api.startSpan('mysql-query');
    var query = createQuery.apply(this, arguments);
    if (api.enhancedDatabaseReportingEnabled()) {
      span.addLabel('sql', query.sql);
      if (query.values) {
        span.addLabel('values', query.values);
      }
    }
    cls.getNamespace().bindEmitter(query);
    if (query._callback) {
      query._callback = wrapCallback(api, span, query._callback);
    } else {
      query.on('end', function() {
        api.endSpan(span);
      });
    }
    return query;
  };
}

function wrapCallback(api, span, done) {
  var fn = function(err, res) {
    var labels = {};
    if (api.enhancedDatabaseReportingEnabled()) {
      if (err) {
        labels.error = err;
      }
      if (res) {
        labels.result = res;
      }
    }
    api.endSpan(span, labels);
    if (done) {
      done(err, res);
    }
  };
  return cls.getNamespace().bind(fn);
}

function wrapGetConnection(getConnection) {
  return function getConnection_trace(cb) {
    return getConnection.call(this, cls.getNamespace().bind(cb));
  };
}

////////////////////////////////////////////////////////////////////////////////

module.exports = [
  {
    file: 'lib/Connection.js',
    versions: SUPPORTED_VERSIONS,
    patch: function(Connection, api) {
      shimmer.wrap(Connection, 'createQuery', createQueryWrap.bind(null, api));
    }
  },
  {
    file: 'lib/Pool.js',
    versions: SUPPORTED_VERSIONS,
    patch: function(Pool, api) {
      shimmer.wrap(Pool.prototype, 'getConnection', wrapGetConnection);
    }
  }
];
