/// <reference types="node" />
import { type Page } from '@playwright/test';

/**
 * GRAFANA_URL is set only by the Cloud cron workflow (.github/workflows/cron.yml),
 * which runs the suite against a shared Grafana Cloud dev instance. Local runs and
 * PR CI leave it unset, so its presence is a reliable signal for "we are on Cloud"
 * that is independent of whether the Vault secrets below actually arrived.
 */
export const isCloudRun = !!process.env.GRAFANA_URL;

/**
 * Reads a value the Cloud workflow injects from Vault, falling back to the
 * docker-compose default only when we are not on Cloud.
 *
 * The fallback must never apply on a Cloud run. A typo'd or expired Vault secret
 * would otherwise point the tests back at the local docker-compose host, where the
 * negative health-check assertions still pass — producing a green nightly that
 * tested nothing. Failing loudly here turns that into a visible error instead.
 */
function requireOnCloud(name: string, localDefault: string): string {
  // Vault values routinely carry a trailing newline, which survives the trip
  // through GITHUB_ENV and would corrupt any URL built from them.
  const value = process.env[name]?.trim();
  if (value) {
    return value;
  }
  if (isCloudRun) {
    throw new Error(
      `${name} is not set, but GRAFANA_URL is, so this is a Cloud run that expects it from Vault. ` +
        `Check the repo-secrets paths in .github/workflows/cron.yml — they are relative to ` +
        `ci/repo/grafana/grafana-zipkin-datasource/.`
    );
  }
  return localDefault;
}

export const DS_NAME = requireOnCloud('DS_INSTANCE_NAME', 'zipkin');
export const DS_URL = requireOnCloud('DS_INSTANCE_URL', 'http://zipkin:9411');

const LOCAL_DS_UID = 'zipkin-e2e';

/**
 * The Cloud instance provisions its own Zipkin data source, so its uid is not the
 * one in provisioning/datasources.yml. Resolve it from the name Vault gave us
 * rather than hardcoding a second constant that can drift.
 */
export async function resolveDataSourceUid(page: Page): Promise<string> {
  const override = process.env.DS_E2E_UID?.trim();
  if (override) {
    return override;
  }
  if (!isCloudRun) {
    return LOCAL_DS_UID;
  }

  // Listing rather than hitting /api/datasources/name/<name> so a stale name in
  // Vault produces a diagnosable error listing what does exist, instead of a
  // bare 404 whose name is masked out of the CI log as a secret.
  const response = await page.request.get('/api/datasources');
  if (!response.ok()) {
    throw new Error(`Could not list data sources on ${process.env.GRAFANA_URL}: HTTP ${response.status()}`);
  }

  const zipkinDataSources: Array<{ name: string; uid: string }> = (await response.json()).filter(
    (ds: { type: string }) => ds.type === 'zipkin'
  );

  const exactMatch = zipkinDataSources.find((ds) => ds.name === DS_NAME);
  if (exactMatch) {
    return exactMatch.uid;
  }

  // The nightly exists to catch the Cloud backend breaking, so a cosmetic name
  // drift should not hold it red when there is exactly one candidate. Warn
  // loudly instead so the stale Vault value still gets noticed and fixed.
  if (zipkinDataSources.length === 1) {
    console.warn(
      `DS_INSTANCE_NAME does not match any data source; falling back to the only Zipkin ` +
        `data source on the instance ("${zipkinDataSources[0].name}"). Update the Vault secret.`
    );
    return zipkinDataSources[0].uid;
  }

  throw new Error(
    `Could not resolve a Zipkin data source matching DS_INSTANCE_NAME. Found ` +
      `${zipkinDataSources.length} Zipkin data source(s): ` +
      `${JSON.stringify(zipkinDataSources.map((ds) => ds.name))}.`
  );
}
