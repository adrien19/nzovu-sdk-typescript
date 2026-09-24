/** @type {import('jest').Config} */
const baseConfig = require("../../jest.config.base.cjs");

module.exports = {
  ...baseConfig,
  displayName: "@nzovu/proto",
  rootDir: "./",
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/index.ts",
    "!src/generated/**", // Exclude generated proto files
  ],
};
