# Contributing

Thank you for your interest in contributing to the Zipkin data source for Grafana! We welcome contributions from the community.

Feel free to [browse open issues](https://github.com/grafana/grafana-zipkin-datasource/issues) or open a new one. For more general guidance, see [Grafana's Contributing Guide](https://github.com/grafana/grafana/blob/main/CONTRIBUTING.md).

This project adheres to the [Grafana Code of Conduct](https://github.com/grafana/grafana/blob/main/CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

For an overview of how the plugin is structured, read [DEVELOPMENT.md](DEVELOPMENT.md) before making larger changes.

## Prerequisites

- [Git](https://git-scm.com/)
- [Go](https://golang.org/dl/) (see [go.mod](go.mod) for the required version)
- [Mage](https://magefile.org/) — backend build tool
- [Node.js](https://nodejs.org) (see [.nvmrc](.nvmrc) for the required version)
- [Yarn](https://yarnpkg.com/) — this repo uses Yarn 4, pinned via the `packageManager` field in [package.json](package.json) and managed through [Corepack](https://nodejs.org/api/corepack.html) (run `corepack enable` if `yarn` isn't found)
- [Docker](https://docs.docker.com/get-docker/) — for the local development environment and E2E tests

> **Note:** The commands below use `yarn`, which is the package manager for this
> repository. Don't use `npm` — it will produce a conflicting lockfile.

## Frontend

1. Install dependencies:

   ```shell
   yarn install --immutable
   ```

2. Build the plugin in development mode and watch for changes:

   ```shell
   yarn dev
   ```

3. Build the plugin in production mode:

   ```shell
   yarn build
   ```

4. Run the unit tests:

   ```shell
   # Watch mode (re-runs on change)
   yarn test

   # Single run, suitable for CI
   yarn test:ci
   ```

5. Lint and type-check:

   ```shell
   yarn lint
   yarn lint:fix   # auto-fix and format
   yarn typecheck
   ```

## Backend

The backend is a Go plugin built with [Mage](https://magefile.org/).

1. Build the backend binaries for all supported platforms:

   ```shell
   mage -v
   ```

2. List all available Mage targets:

   ```shell
   mage -l
   ```

3. Run the backend unit tests:

   ```shell
   mage test
   # or directly:
   go test ./pkg/...
   ```

> Any change to `src/plugin.json` requires a **restart of the Grafana server** to
> take effect.

## Local development environment

`yarn server` starts a local Zipkin instance and a Grafana instance with the
plugin pre-provisioned (see [docker-compose.yaml](docker-compose.yaml) and
[provisioning/](provisioning/)):

```shell
yarn server
```

This brings up:

- **Grafana** with the built plugin mounted and the Zipkin data source provisioned (`provisioning/datasources/datasources.yml`).
- **Zipkin** (`openzipkin/zipkin:3`) on port `9411`.
- A one-shot **fixture loader** that POSTs sample traces (from `tests/e2e/fixtures/`) into Zipkin with refreshed timestamps so they don't age out of Zipkin's in-memory store.

To run against a specific Grafana version:

```shell
GRAFANA_VERSION=12.3.0 yarn server
```

## E2E tests

End-to-end tests use [`@grafana/plugin-e2e`](https://grafana.com/developers/plugin-tools/e2e-test-a-plugin/) and Playwright. Start the environment, then run the tests:

```shell
yarn server
yarn e2e
```

To install the Playwright browsers first:

```shell
yarn playwright install --with-deps
yarn server
yarn e2e
```

Test specs live in [`tests/e2e/`](tests/e2e/).

## Submitting changes

1. Create a branch for your change.
2. Make your change, including tests where appropriate.
3. Add a changeset describing the change (see [Release](#release) below).
4. Run `yarn lint`, `yarn test:ci`, and `mage test` locally.
5. Open a pull request. CI runs lint, unit tests, and Playwright E2E via [`grafana/plugin-ci-workflows`](https://github.com/grafana/plugin-ci-workflows).

## Release

This repository uses [Changesets](https://github.com/changesets/changesets) to
manage versions and the changelog. **Do not edit `CHANGELOG.md` by hand** — it is
generated from changeset files.

1. After making a user-facing change, add a changeset:

   ```shell
   yarn changeset
   ```

   Select the bump type (`patch`, `minor`, or `major`) and write a short summary.
   This creates a markdown file under [`.changeset/`](.changeset/) that you commit
   alongside your change.

2. When changesets are merged to `main`, the version bump and `CHANGELOG.md`
   update are applied as part of the release process.

3. Publishing requires commit access to the repository. Follow the release
   process described [here](https://enghub.grafana-ops.net/docs/default/component/grafana-plugins-platform/plugins-ci-github-actions/010-plugins-ci-github-actions/#cd_1).
