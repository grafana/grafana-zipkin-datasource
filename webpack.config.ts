// TODO delete this after removing ./_vendor folder

import type { Configuration, RuleSetRule } from 'webpack';
import { mergeWithRules } from 'webpack-merge';
import grafanaConfig from './.config/webpack/webpack.config';

const config = async (env: { [key: string]: true | string }): Promise<Configuration> => {
  const baseConfig = await grafanaConfig(env);

  // The base swc-loader config doesn't set the React JSX runtime, so it defaults
  // to classic (requires `React` in scope). Patch it to use the automatic runtime,
  // matching what tsconfig.json already sets via `"jsx": "react-jsx"`.
  const rules = baseConfig.module?.rules ?? [];
  for (const rule of rules) {
    if (rule && typeof rule === 'object' && !Array.isArray(rule)) {
      const r = rule as RuleSetRule;
      const use = r.use as { loader?: string; options?: { jsc?: Record<string, unknown> } };
      if (use?.loader === 'swc-loader') {
        use.options = {
          ...use.options,
          jsc: {
            ...use.options?.jsc,
            transform: {
              react: { runtime: 'automatic' },
            },
          },
        };
      }
    }
  }

  return mergeWithRules({
    module: {
      rules: 'append',
    },
  })(baseConfig, {
    module: {
      rules: [
        // @grafana/o11y-ds-frontend ships raw TypeScript source, so we need
        // to transpile it explicitly (the base rule excludes all node_modules).
        {
          test: /\.[tj]sx?$/,
          include: /node_modules\/@grafana\/o11y-ds-frontend/,
          use: {
            loader: 'swc-loader',
            options: {
              jsc: {
                target: 'es2015',
                loose: false,
                parser: {
                  syntax: 'typescript',
                  tsx: true,
                  decorators: false,
                  dynamicImport: true,
                },
                transform: {
                  react: { runtime: 'automatic' },
                },
              },
            },
          },
        },
      ],
    },
  });
};

export default config;
