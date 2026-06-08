module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      ['api', 'web', 'shared', 'db', 'infra'],
    ],
    'header-max-length': [2, 'always', 72],
  },
};
