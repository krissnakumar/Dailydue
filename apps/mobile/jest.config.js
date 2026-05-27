/** @type {import('jest').Config} */
module.exports = {
  testMatch: ['**/__tests__/**/*.test.[jt]s?(x)'],
  testPathIgnorePatterns: ['/node_modules/'],
  transform: {},
  testEnvironment: 'node',
  verbose: true,
};
