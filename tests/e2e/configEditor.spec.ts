import { type DataSourceJsonData } from '@grafana/data';
import { expect, test } from '@grafana/plugin-e2e';
import { type Locator, type Page } from '@playwright/test';

// Inlined to avoid pulling `@grafana/runtime` (which requires browser globals)
// into the test build. Keep in sync with `ZipkinJsonData` in
// `src/datasource.ts`.
type ZipkinJsonData = DataSourceJsonData & {
  nodeGraph?: { enabled?: boolean };
};

const PLUGIN_TYPE = 'zipkin';
const PROVISIONED_FILE = 'datasources.yml';

// In CI/Cloud the data source URL is provisioned from Vault and exposed via
// DS_INSTANCE_URL. Locally docker-compose names the backend `zipkin` and the
// provisioned datasources.yml uses http://zipkin:9411.
const DS_URL = process.env.DS_INSTANCE_URL || 'http://zipkin:9411';

// Grafana 13 migrated multiple UI surfaces from aria-label to data-testid
// (https://github.com/grafana/grafana/pull/121784). This helper matches both
// shapes so tests work across versions.
function getDataSourceConnectionUrlInput(page: Page): Locator {
  return page.locator(
    '[data-testid="data-testid Data source connection URL"], [aria-label="Data source connection URL"]'
  );
}

test.describe('Config editor', () => {
  test.describe('rendering', () => {
    test(
      'smoke: should render config editor',
      { tag: '@plugins' },
      async ({ createDataSourceConfigPage, page }) => {
        await createDataSourceConfigPage({ type: PLUGIN_TYPE });

        await expect(page.getByText(/Before you can use the Zipkin data source/)).toBeVisible();
        // Grafana <=13.0: "Type: Zipkin" subtitle in the page header.
        // Grafana >=13.1: subtitle removed (grafana/grafana#123966).
        // Fall back to the Connection heading so this also serves as the
        // page-load wait on builds where the type label is gone.
        await expect(
          page
            .getByText('Type: Zipkin', { exact: true })
            .or(page.getByText(/^Type\s*Zipkin$/))
            .or(page.getByRole('heading', { name: 'Connection', exact: true }))
        ).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Connection', exact: true })).toBeVisible();
        await expect(getDataSourceConnectionUrlInput(page)).toBeVisible();
      }
    );

    test('should render Authentication section', async ({ createDataSourceConfigPage, page }) => {
      await createDataSourceConfigPage({ type: PLUGIN_TYPE });

      const heading = page.getByRole('heading', { name: 'Authentication', exact: true });
      await heading.scrollIntoViewIfNeeded();
      await expect(heading).toBeVisible();
      // Auth method combobox is rendered by @grafana/plugin-ui
      await expect(page.getByRole('combobox', { name: 'Authentication method' })).toBeVisible();
    });

    test('should render Trace to logs section', async ({ createDataSourceConfigPage, page }) => {
      await createDataSourceConfigPage({ type: PLUGIN_TYPE });

      const heading = page.getByRole('heading', { name: 'Trace to logs', exact: true });
      await heading.scrollIntoViewIfNeeded();
      await expect(heading).toBeVisible();
    });

    test('should render Trace to metrics section', async ({ createDataSourceConfigPage, page }) => {
      await createDataSourceConfigPage({ type: PLUGIN_TYPE });

      const heading = page.getByRole('heading', { name: 'Trace to metrics', exact: true });
      await heading.scrollIntoViewIfNeeded();
      await expect(heading).toBeVisible();
    });

    test('should render Additional settings section', async ({ createDataSourceConfigPage, page }) => {
      await createDataSourceConfigPage({ type: PLUGIN_TYPE });

      const heading = page.getByRole('heading', { name: 'Additional settings', exact: true });
      await heading.scrollIntoViewIfNeeded();
      await expect(heading).toBeVisible();
    });
  });

  test.describe('provisioned datasource', () => {
    test('should load provisioned URL', async ({ readProvisionedDataSource, gotoDataSourceConfigPage, page }) => {
      const ds = await readProvisionedDataSource<ZipkinJsonData>({ fileName: PROVISIONED_FILE });
      await gotoDataSourceConfigPage(ds.uid);

      await page.getByRole('heading', { name: 'Connection', exact: true }).scrollIntoViewIfNeeded();
      await expect(getDataSourceConnectionUrlInput(page)).toHaveValue(DS_URL);
    });
  });

  test.describe('save & test', () => {
    test('should pass health check for provisioned datasource', async ({
      readProvisionedDataSource,
      gotoDataSourceConfigPage,
      page,
    }) => {
      const ds = await readProvisionedDataSource({ fileName: PROVISIONED_FILE });
      const configPage = await gotoDataSourceConfigPage(ds.uid);

      // Match both `Save & test` (editable: true) and `Test` (editable: false)
      await page.getByRole('button', { name: /^(Save & test|Test)$/ }).click();
      await expect(configPage).toHaveAlert('success');
    });

    test('should show error alert when health check fails', async ({ createDataSourceConfigPage, page }) => {
      const configPage = await createDataSourceConfigPage({ type: PLUGIN_TYPE });

      // `localhost` from inside the Grafana container never resolves to the Zipkin service
      await getDataSourceConnectionUrlInput(page).fill('http://localhost:9411');
      await page.getByRole('button', { name: /^(Save & test|Test)$/ }).click();
      await expect(configPage).toHaveAlert('error');
    });

    test('should show error alert when backend is unreachable', async ({ createDataSourceConfigPage, page }) => {
      const configPage = await createDataSourceConfigPage({ type: PLUGIN_TYPE });

      // Point at a port nothing is listening on (uses the Cloud host where present)
      const url = DS_URL.replace(/:(\d+)$/, ':19411');
      await getDataSourceConnectionUrlInput(page).fill(url);
      await page.getByRole('button', { name: /^(Save & test|Test)$/ }).click();
      await expect(configPage).toHaveAlert('error');
    });
  });
});
