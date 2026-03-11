// force timezone to UTC to allow tests to work regardless of local timezone
// generally used by snapshots, but can affect specific tests
process.env.TZ = 'UTC';

const { grafanaESModules, nodeModulesToTransform } = require('./.config/jest/utils');

// NOTE: The overrides below (transformIgnorePatterns and transform) are required because of the
// _vendor folder. @grafana/o11y-ds-frontend is vendored locally and ships raw TypeScript source.
// If the _vendor folder is removed and replaced with a published package, these overrides may no longer be needed.
module.exports = {
  // Jest configuration provided by Grafana scaffolding
  ...require('./.config/jest.config'),
  // @grafana/o11y-ds-frontend is vendored with "main" pointing to raw TypeScript source,
  // so it must be transformed by @swc/jest like other ESM packages.
  transformIgnorePatterns: [nodeModulesToTransform([...grafanaESModules, '@grafana/o11y-ds-frontend'])],
  // Enable React 17+ automatic JSX runtime to match tsconfig "jsx": "react-jsx",
  // so JSX files don't require explicit `import React from 'react'`.
  transform: {
    '^.+\\.(t|j)sx?$': [
      '@swc/jest',
      {
        sourceMaps: 'inline',
        jsc: {
          parser: {
            syntax: 'typescript',
            tsx: true,
            decorators: false,
            dynamicImport: true,
          },
          transform: {
            react: {
              runtime: 'automatic',
            },
          },
        },
      },
    ],
  },
};
