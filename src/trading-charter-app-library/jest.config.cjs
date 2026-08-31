/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.jest.json" }],
  },
  // Source files import relative modules with an explicit ".js" extension
  // (required for the ESM build output in tsconfig.json), but the test
  // compile targets CommonJS against the .ts sources directly — this maps
  // "./Scale.js" back to "./Scale" so Jest resolves the .ts file instead
  // of looking for a .js file that doesn't exist pre-build.
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
};
