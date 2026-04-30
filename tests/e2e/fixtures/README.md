# E2E fixture traces

These JSON files are loaded into the Zipkin instance by the `zipkin-loader`
service in `docker-compose.yaml` before Grafana starts.

Each file contains a Zipkin v2 spans payload with two placeholders that the
loader substitutes at runtime:

- `__NOW_US__` — `now` in microseconds since epoch (the loader uses
  `date +%s` * 1000000)
- `__NOW_US_PLUS_<N>__` — `now + N` microseconds (the loader uses sed)

Timestamps must be dynamic because Zipkin's default in-memory store has a
finite retention window — absolute timestamps would age out between test runs.

The trace IDs (`1111111111111111`, `2222222222222222`) are deterministic so
that tests can query them directly via Explore URL.
