import { expect, test } from '@grafana/plugin-e2e';
import { type Locator, type Page } from '@playwright/test';

// Grafana 13 migrated query editor row selectors from aria-label to data-testid
// (https://github.com/grafana/grafana/pull/121784). This helper matches both so tests work across versions
// until @grafana/plugin-e2e ships a fix and this repo upgrades.
function getQueryEditorRow(page: Page, refId: string): Locator {
  return page
    .locator('[data-testid="data-testid Query editor row"], [aria-label="Query editor row"]')
    .filter({
      has: page.locator(
        `[data-testid="data-testid Query editor row title ${refId}"], [aria-label="Query editor row title ${refId}"]`
      ),
    });
}

test.describe('Query editor', () => {
  test(
    'smoke: renders query editor controls',
    { tag: '@plugins' },
    async ({ explorePage, page }) => {
      await explorePage.mockResourceResponse('services', []);
      await explorePage.datasource.set('zipkin');

      const queryRow = getQueryEditorRow(page, 'A');
      await expect(queryRow.getByText('Query type', { exact: true })).toBeVisible();
      await expect(queryRow.getByRole('radio', { name: 'TraceID' })).toBeVisible();
      await expect(queryRow.getByRole('button', { name: 'Import trace' })).toBeVisible();
    }
  );
});
