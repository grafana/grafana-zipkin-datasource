# Developer guide

This document explains how the Zipkin data source plugin is structured and how
data flows through it. Read this before making non-trivial changes. For
environment setup, build, and test commands, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Overview

This is a **hybrid Grafana data source plugin**: it has both a Go backend and a
React/TypeScript frontend.

- The **backend** (`pkg/`) runs as a separate process managed by Grafana. It
  proxies requests to a Zipkin instance's [HTTP v2 API](https://zipkin.io/zipkin-api/)
  and converts the responses into Grafana's trace `data.Frame` format.
- The **frontend** (`src/`) provides the configuration editor, the query editor,
  and frontend-only behavior such as JSON trace upload and node-graph
  augmentation.

Running queries through the backend (rather than the browser) avoids CORS issues,
keeps credentials server-side, and centralizes the span-to-frame transformation.

## Repository layout

```
.
├── pkg/                      # Go backend
│   ├── main.go               # Plugin entry point (datasource.Manage)
│   └── zipkin/
│       ├── zipkin.go         # Datasource: CheckHealth, QueryData, CallResource
│       ├── client.go         # Zipkin HTTP v2 API client (Services/Spans/Traces/Trace)
│       ├── handler_querydata.go    # Query handling + span → data.Frame transform
│       ├── handler_callresource.go # Resource routes for the trace selector
│       └── testdata/         # Golden files for transform tests
├── src/                      # TypeScript/React frontend
│   ├── module.ts             # Plugin registration (wires editors to datasource)
│   ├── datasource.ts         # ZipkinDatasource (DataSourceWithBackend)
│   ├── ConfigEditor.tsx      # Data source settings UI
│   ├── QueryField.tsx        # Query editor UI
│   ├── types.ts              # Shared types (ZipkinQuery, ZipkinSpan, ...)
│   ├── utils/
│   │   ├── transforms.ts     # Frontend span → DataFrame transform (upload path)
│   │   └── graphTransform.ts # Build node-graph frames from spans
│   └── mocks/                # Test fixtures
├── tests/e2e/                # Playwright E2E specs and trace fixtures
├── provisioning/             # Local-dev data source provisioning
├── docs/sources/_index.md    # User-facing product documentation
├── Magefile.go               # Backend build targets
├── docker-compose.yaml       # Local dev environment (Grafana + Zipkin + loader)
└── .config/                  # Managed by @grafana/create-plugin — do not edit
```

## Backend architecture

### Entry point

`pkg/main.go` calls `datasource.Manage("zipkin", zipkin.NewDatasource, ...)`. The
Grafana plugin SDK manages the lifecycle of `Datasource` instances — one per
configured data source — calling `NewDatasource` when configuration changes.

### Datasource

`pkg/zipkin/zipkin.go` defines `Datasource`, which implements three SDK
interfaces:

- **`CheckHealth`** — used by **Save & test**. Calls the Zipkin `Services()`
  endpoint and reports success or the downstream error.
- **`QueryData`** — handles trace queries (see [data flow](#data-flow) below).
- **`CallResource`** — exposes a small HTTP router (`registerResourceRoutes`) the
  frontend calls to populate the interactive trace selector.

`NewDatasource` builds an `*http.Client` from the SDK's `HTTPClientOptions`, which
automatically applies the configured URL, auth, TLS, and proxy settings.

### Zipkin client

`pkg/zipkin/client.go` defines the `Client` interface and its HTTP implementation
against the Zipkin v2 API:

| Method                        | Zipkin endpoint                  | Used by                          |
| ----------------------------- | -------------------------------- | -------------------------------- |
| `Services()`                  | `GET /api/v2/services`           | Health check, trace selector     |
| `Spans(service)`              | `GET /api/v2/spans`              | Trace selector                   |
| `Traces(service, span)`       | `GET /api/v2/traces`             | Trace selector                   |
| `Trace(traceID)`              | `GET /api/v2/trace/{traceId}`    | `QueryData` (trace-by-ID query)  |

`NewZipkinClient` is a package-level `var` (not a plain function) so tests can
swap in a mock client.

### Resource routes

`pkg/zipkin/handler_callresource.go` wires a `http.ServeMux` that the frontend
calls via `getResource(...)`:

```
GET /services
GET /spans?serviceName=...
GET /traces?serviceName=...&spanName=...
GET /trace/{traceId}
```

These power the cascading **service → operation → trace** selector in the query
editor.

### Span-to-frame transformation

`pkg/zipkin/handler_querydata.go` is the core of the backend. For each query it
calls `Client.Trace(...)`, then `transformResponse` converts `[]model.SpanModel`
into a single trace `data.Frame` with these fields:

```
traceID, spanID, parentSpanID, operationName, serviceName,
serviceTags, startTime, duration, logs, tags
```

The frame's metadata marks it for the trace visualization:

```go
newFrame.Meta = &data.FrameMeta{
    PreferredVisualization: "trace",
    Custom: map[string]interface{}{"traceFormat": "zipkin"},
}
```

Notable mapping details:

- **Service name** is resolved from `LocalEndpoint`, falling back to
  `RemoteEndpoint`, then `"unknown"`.
- **Annotations** become `logs` entries (each annotation value under an
  `annotation` key).
- The **`error` tag** is remapped to a boolean `error: true` plus an
  `errorValue` holding the original message, so the UI shows the error icon.
- `kind` and `shared` are prepended to the tag list when present.
- Timestamps and durations are converted from microseconds to **milliseconds**.

## Frontend architecture

### Registration

`src/module.ts` registers the plugin, attaching the query and config editors to
the data source class:

```ts
export const plugin = new DataSourcePlugin(ZipkinDatasource)
  .setQueryEditor(ZipkinQueryField)
  .setConfigEditor(ConfigEditor);
```

### Datasource class

`src/datasource.ts` defines `ZipkinDatasource extends DataSourceWithBackend`.
Extending `DataSourceWithBackend` means standard queries are sent to the Go
backend's `QueryData`. The class adds frontend-specific behavior in `query()`:

- **`queryType === 'upload'`** — handled entirely in the browser. The uploaded
  JSON is parsed and transformed locally via `transformResponse`
  (`src/utils/transforms.ts`); it is never sent to the backend (the backend
  explicitly rejects the `upload` query type).
- **Standard trace-by-ID query** — delegated to `super.query()` (the backend),
  then optionally augmented with node-graph frames if node graph is enabled.
- **Empty query** — returns an empty trace frame.

`metadataRequest()` wraps `getResource(...)`, calling the backend resource routes
to populate the trace selector.

### Editors

- **`src/ConfigEditor.tsx`** — renders the data source settings (URL, auth, trace
  to logs/metrics, node graph, span bar). Many of these reuse shared components
  from `@grafana/o11y-ds-frontend`.
- **`src/QueryField.tsx`** — the query editor, supporting query-by-trace-ID and
  the interactive trace selector.

### Node graph

`src/utils/graphTransform.ts` (frontend) and `createNodeGraphFrames` from
`@grafana/o11y-ds-frontend` build node and edge frames so the trace's service
topology can render as a node graph when the feature is enabled in config.

## Data flow

**Trace by ID (backend path):**

```
QueryField → ZipkinDatasource.query() → super.query()
  → backend QueryData → Client.Trace(traceID) → Zipkin GET /api/v2/trace/{id}
  → transformResponse → data.Frame (trace) → [optional node-graph frames] → UI
```

**Trace selector (resource path):**

```
QueryField → metadataRequest() → getResource('/services' | '/spans' | '/traces')
  → backend CallResource → Client.Services/Spans/Traces → Zipkin v2 API → UI
```

**JSON upload (frontend-only path):**

```
QueryField (upload) → ZipkinDatasource.query() → JSON.parse
  → transforms.ts transformResponse → data.Frame (trace) → UI
```

> The span-to-frame transform exists in **two places** — Go
> (`handler_querydata.go`) for live queries and TypeScript
> (`utils/transforms.ts`) for the upload path. Keep them consistent when changing
> the output frame shape.

## Build and tooling

- **Frontend** is built with **webpack** using the config in `.config/`. Use
  `yarn dev` / `yarn build`. Do not replace the build system.
- **Backend** is built with **Mage** (`Magefile.go`), which wraps the plugin SDK
  build. `mage -v` (or `mage BuildAll`) cross-compiles binaries for all supported
  platforms, including extras such as `linux/s390x` and `windows/arm64` needed for
  bundling with Grafana.
- `.config/` is **managed by `@grafana/create-plugin`** and must not be edited
  directly. To extend webpack/eslint/prettier, follow the
  [extend-configurations guide](https://grafana.com/developers/plugin-tools/how-to-guides/extend-configurations).

## Testing

- **Backend unit tests** — `*_test.go` under `pkg/zipkin/`, including golden-file
  tests in `pkg/zipkin/testdata/`. Run with `mage test` or `go test ./pkg/...`.
- **Frontend unit tests** — Jest (`*.test.ts[x]` under `src/`). Run with
  `yarn test` (watch) or `yarn test:ci`.
- **E2E tests** — Playwright via `@grafana/plugin-e2e` in `tests/e2e/`. They run
  against the Docker environment (`yarn server` + `yarn e2e`). The fixture loader
  in `docker-compose.yaml` rewrites trace timestamps to "now" on each run so the
  in-memory Zipkin store always has fresh data.

## Conventions

- Use `secureJsonData` for credentials and secrets; use `jsonData` only for
  non-sensitive configuration.
- Don't change the plugin `id` or `type` in `src/plugin.json`. Any `plugin.json`
  change requires restarting Grafana.
- Grafana's plugin API changes frequently — consult the
  [plugin tools documentation](https://grafana.com/developers/plugin-tools/) (and
  the indexes referenced in `.config/AGENTS/instructions.md`) rather than relying
  on memory.
