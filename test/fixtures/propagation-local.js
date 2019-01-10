module.exports = {
  extract: (getter) => {
    return JSON.parse(getter.getHeader('my-trace-header'));
  },
  inject: (setter, context) => {
    context && setter.setHeader('my-trace-header', JSON.stringify(context));
  }
};
