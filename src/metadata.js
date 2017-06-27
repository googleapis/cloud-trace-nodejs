var gcpMetadata = require('gcp-metadata');
var constants = require('./constants.js');

// prevent self tracing
var headers = {};
headers[constants.TRACE_AGENT_REQUEST_HEADER] = 1;

module.exports = function getMetadata(logger, fields, cb) {
  var result = {};
  var next = function() {
    cb(null, result);
  };
  for (var i = fields.length - 1; i >= 0; i--) {
    (function() {
      var endpoint = fields[i].endpoint;
      var property = fields[i].property;
      var onError = fields[i].onError;

      var prevNext = next;
      next = function() {
        gcpMetadata[endpoint]({
          property: property,
          headers: headers
        }, function(err, response, body) {
          if (response && response.statusCode !== 200) {
            if (response.statusCode === 503) {
              err = new Error('Metadata service responded with a 503 status ' +
                'code. This may be due to a temporary server error; please try ' +
                'again later.');
            } else {
              err = new Error('Metadata service responded with the following ' +
                'status code: ' + response.statusCode);
            }
          }
          if (err) {
            if (err.code !== 'ENOTFOUND') {
              // We are running on GCP.
              logger.error('Unable to retrieve ' + property + ' from metadata: ', err);
            }
            if (onError === 'break') {
              cb(err);
              return;
            }
          }
          if (!result[endpoint]) {
            result[endpoint] = {};
          }
          result[endpoint][property] = body;
          prevNext();
        })
      }
    })()
  }
  next()
}