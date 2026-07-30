# Developer guide

A quick orientation to the two halves of this plugin, and how to build,
debug, and run them locally. For the full command reference (prerequisites,
linting, changesets, releases), see [CONTRIBUTING.md](CONTRIBUTING.md).

## Backend (`pkg/`)

A Go process, managed by Grafana, that queries a Zipkin instance's HTTP v2 API
and converts the response into a trace `data.Frame`.

- **Build:** `mage -v` (all platforms) — see [Magefile.go](Magefile.go).
- **Test:** `mage test` or `go test ./pkg/...`.
- **Debug:** run `DEVELOPMENT=true yarn server` — this installs
  [Delve](https://github.com/go-delve/delve) in the Grafana container and
  exposes it on `localhost:2345`, so you can attach a remote Go debugger to
  the running plugin. Backend logs are already at debug level by default
  (`GF_LOG_FILTERS: plugin.grafana-zipkin-datasource:debug` in
  [`.config/docker-compose-base.yaml`](.config/docker-compose-base.yaml)) and
  show up in `docker compose logs -f grafana`.

## Frontend (`src/`)

TypeScript/React code for the config editor, query editor, and frontend-only
behavior (JSON trace upload, node graph).

- **Build:** `yarn dev` (watch mode) or `yarn build`.
- **Test:** `yarn test` (watch) or `yarn test:ci`.
- **Debug:** with `yarn dev` running, changes rebuild automatically — reload
  the Grafana tab to pick them up, then use normal browser dev tools.

## Seeing it run in Docker

```shell
yarn server
```

This builds the plugin and starts Grafana (with the plugin pre-provisioned)
alongside a Zipkin instance and a fixture loader that seeds it with sample
traces — see [docker-compose.yaml](docker-compose.yaml) and
[CONTRIBUTING.md](CONTRIBUTING.md#local-development-environment) for details.
Open Grafana at http://localhost:3000 and query the Zipkin data source from
Explore. `docker compose logs -f` tails all container output, and
`docker compose down` tears the stack down.
