const { ExpressInstrumentation, createPlugin } = require(require('../../..').defaultConfig.plugins.express);

class GCFExpressInstrumentation extends ExpressInstrumentation {
  generateSpanName(req) {
    if (req.path === '/execute') {
      return process.env.X_GOOGLE_FUNCTION_NAME;
    } else {
      return req.path;
    }
  }
}

module.exports = createPlugin(GCFExpressInstrumentation);
