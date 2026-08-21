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
  const value = process.env[name];
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
  if (process.env.DS_E2E_UID) {
    return process.env.DS_E2E_UID;
  }
  if (!isCloudRun) {
    return LOCAL_DS_UID;
  }
  const response = await page.request.get(`/api/datasources/name/${encodeURIComponent(DS_NAME)}`);
  if (!response.ok()) {
    throw new Error(`Could not resolve uid for data source "${DS_NAME}": HTTP ${response.status()}`);
  }
  return (await response.json()).uid;
}
