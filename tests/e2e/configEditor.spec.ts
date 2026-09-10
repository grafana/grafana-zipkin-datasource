import { type DataSourceJsonData } from '@grafana/data';
import { expect, test } from '@grafana/plugin-e2e';
import { type Locator, type Page } from '@playwright/test';

import { DS_URL, isCloudRun, resolveDataSourceUid } from './env';

// Inlined to avoid pulling `@grafana/runtime` (which requires browser globals)
// into the test build. Keep in sync with `ZipkinJsonData` in
// `src/datasource.ts`.
type ZipkinJsonData = DataSourceJsonData & {
  nodeGraph?: { enabled?: boolean };
};

const PLUGIN_TYPE = 'zipkin';
const PROVISIONED_FILE = 'datasources.yml';

// Points the URL at a port nothing is listening on. Uses the URL API rather
// than a regex so it also works for Cloud URLs that carry no explicit port.
function unreachableUrl(raw: string): string {
  const url = new URL(raw);
  url.port = '19411';
  return url.toString();
}

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
    test('smoke: should render config editor', { tag: '@plugins' }, async ({ createDataSourceConfigPage, page }) => {
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
          .first()
      ).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Connection', exact: true })).toBeVisible();
      await expect(getDataSourceConnectionUrlInput(page)).toBeVisible();
    });

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
    test.beforeEach(() => {
      test.skip(
        isCloudRun,
        'Asserts values from the local provisioning/datasources/datasources.yml, which is not applied on the shared Cloud instance.'
      );
    });

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
      test.skip(
        isCloudRun,
        'Reads the local provisioning file; the Cloud instance provisions its own Zipkin data source.'
      );

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
      await getDataSourceConnectionUrlInput(page).fill(unreachableUrl(DS_URL));
      await page.getByRole('button', { name: /^(Save & test|Test)$/ }).click();
      await expect(configPage).toHaveAlert('error');
    });
  });

  // The Cloud counterpart of the provisioned-datasource health check above.
  // Without it every test that survives on Cloud either renders the config form
  // or asserts a *negative* health check, so the nightly would stay green even
  // if the Cloud Zipkin backend were completely unreachable.
  test.describe('cloud datasource', () => {
    test.beforeEach(() => {
      test.skip(!isCloudRun, 'Targets the Zipkin data source provisioned on the shared Cloud instance.');
    });

    test('should pass health check for the Cloud-provisioned datasource', async ({
      gotoDataSourceConfigPage,
      page,
    }) => {
      const configPage = await gotoDataSourceConfigPage(await resolveDataSourceUid(page));

      await page.getByRole('button', { name: /^(Save & test|Test)$/ }).click();
      await expect(configPage).toHaveAlert('success');
    });
  });
});
