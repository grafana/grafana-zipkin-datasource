// TODO delete this after removing ./_vendor folder

import type { Configuration } from 'webpack';
import { mergeWithRules } from 'webpack-merge';
import grafanaConfig from './.config/webpack/webpack.config';

const config = async (env: { [key: string]: true | string }): Promise<Configuration> => {
  const baseConfig = await grafanaConfig(env);

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
              },
            },
          },
        },
      ],
    },
  });
};

export default config;
