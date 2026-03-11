import { expect, test } from '@grafana/plugin-e2e';

test(
  'smoke: should render config editor',
  {
    tag: '@plugins',
  },
  async ({ createDataSourceConfigPage, page }) => {
    await createDataSourceConfigPage({ type: 'grafana-zipkin-datasource' });

    await expect(await page.getByText('Type: Zipkin', { exact: true })).toBeVisible();
    await expect(await page.getByRole('heading', { name: 'Connection', exact: true })).toBeVisible();
  }
);
