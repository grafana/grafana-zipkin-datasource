import { expect, test } from '@grafana/plugin-e2e';

const PLUGIN_TYPE = 'zipkin';

test.describe('Config editor', () => {
  test(
    'smoke: should render config editor',
    {
      tag: '@plugins',
    },
    async ({ createDataSourceConfigPage, page }) => {
      await createDataSourceConfigPage({ type: PLUGIN_TYPE });

      // @grafana/plugin-ui DataSourceDescription copy (not "Type: Zipkin", which Grafana core no longer renders here)
      await expect(page.getByText(/Before you can use the Zipkin data source/)).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Connection', exact: true })).toBeVisible();
      await expect(page.getByLabel('Data source connection URL')).toBeVisible();
    }
  );
});
