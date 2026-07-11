# Feature request: historical metrics through the LXD API

Draft proposal for the LXD server, written from the perspective of LXD-UI.
Related prototype: the `instance-usage-graphs` branch of LXD-UI renders CPU and
memory usage graphs on the instance overview page from realtime polling of
`/1.0/metrics`.

## Problem

`/1.0/metrics` only reports the current state. This limits what any API client
(including LXD-UI) can show:

- Usage graphs start empty on every page load and only fill up while the page
  stays open. Reloading the browser discards everything.
- CPU usage is a counter, so a percentage needs two samples. After a page load
  the UI waits one poll interval before it can show any CPU value at all.
- Retention is bounded by browser memory and the lifetime of a tab. There is
  no way to answer "what did this instance do overnight?".

Operators already solve retention today by pointing Prometheus at
`/1.0/metrics` ([metrics documentation](https://documentation.ubuntu.com/lxd/en/latest/metrics/)).
But that history is only useful to clients that can reach the Prometheus
server. Browsers running LXD-UI usually cannot: Prometheus sits on a
management network, has its own authentication, and granting every UI user
network access to it defeats the point of LXD's own authorization model.

Every major virtualization platform ships usage graphs out of the box
(Proxmox VE stores RRD history and serves it over its API, vSphere has the
performance manager, virt-manager draws live graphs). This is a visible
feature gap for LXD.

## Proposal

LXD serves historical metrics through its own API and handles the data source
behind the scenes. Clients only ever talk to LXD.

```
GET /1.0/metrics/history?project=default&instance=vm1&start=-1h&step=15s
```

Parameters:

- `project`, `instance` — scope of the query. Instance may be omitted to get
  all instances the caller is entitled to view (e.g. for a project dashboard).
- `start`, `end` — RFC 3339 timestamps or relative offsets, `end` defaults to
  now.
- `step` — resolution of the returned series, with a server-enforced minimum.
- `metrics` — optional comma-separated allowlist of metric names, defaults to
  a small core set (cpu, memory, filesystem, network).

Response: JSON series, one entry per metric name and label set.

```json
{
  "type": "sync",
  "status_code": 200,
  "metadata": {
    "start": "2026-07-11T13:00:00Z",
    "end": "2026-07-11T14:00:00Z",
    "step_seconds": 15,
    "series": [
      {
        "name": "lxd_cpu_seconds_total",
        "labels": { "name": "vm1", "project": "default", "cpu": "0", "mode": "user" },
        "points": [[1783938600, 4321.5], [1783938615, 4322.1]]
      },
      {
        "name": "lxd_memory_MemFree_bytes",
        "labels": { "name": "vm1", "project": "default" },
        "points": [[1783938600, 2147483648]]
      }
    ]
  }
}
```

The endpoint is backend-agnostic. Two backends, which complement rather than
exclude each other:

### Backend 1: Prometheus proxy

The operator already runs Prometheus (or Mimir, Thanos, VictoriaMetrics —
anything speaking the Prometheus HTTP API). LXD proxies range queries to it:

```
lxc config set metrics.history.backend=prometheus
lxc config set metrics.history.address=https://prometheus.mgmt.example.com:9090
lxc config set metrics.history.auth.username=...   # or TLS client cert
```

Design points:

- **No raw PromQL passthrough.** LXD builds `query_range` requests from fixed
  templates keyed by metric name and always injects `name` and `project` label
  matchers derived from the authenticated caller. A passthrough would let any
  metrics-entitled client read every tenant's series (or worse, anything else
  scraped into that Prometheus); with templates, query injection is impossible
  by construction.
- **Authorization is LXD's.** The same entitlement that gates `/1.0/metrics`
  today (`can_view_metrics`, and per-project restrictions) gates history.
  Prometheus credentials live in the LXD config and never reach the client.
- **Cluster-aware.** Prometheus scrapes every cluster member; the proxy can
  answer for any instance regardless of which member serves the request, so no
  `target=` fan-out is needed.

### Backend 2: built-in ring buffer (default)

For the majority of installations that never configure Prometheus, LXD
samples its own metrics into a bounded buffer:

```
lxc config set metrics.history.retention=1h    # 0 disables sampling
```

- Fixed memory cost, computable up front: retention / step × number of series.
  With a 15s step, one hour keeps 240 points per series. Persisting to the
  database is optional and could come later; in-memory is already a large win.
- Zero external dependencies — graphs work on a fresh `snap install lxd`.
  This matters: a feature "all other vendors have" cannot depend on the user
  operating a metrics stack first. Proxmox's built-in RRD storage is the
  precedent.
- Also fixes the CPU cold start for realtime clients: two samples are always
  available immediately.

Selection logic: ring buffer serves what it has; if a Prometheus backend is
configured, queries older than the buffer (or all queries, for simplicity) go
to the proxy.

## UI integration

With this endpoint the UI flow becomes:

1. On instance page load, `GET /1.0/metrics/history?...&start=-30m` backfills
   the graphs instantly — including a CPU percentage computed from the last
   two historical samples, removing today's "wait one poll interval" state.
2. The existing 15s polling of `/1.0/metrics` (or future websocket pushes)
   appends live points.

The prototype branch isolates all of this behind two functions
(`getCpuSeries` / `getMemorySeries` in `src/util/metricHistorySeries.ts`), so
swapping the data source from browser-accumulated history to the API is a
contained change.

## Alternatives considered

- **UI queries Prometheus directly.** Rejected: browsers usually cannot reach
  it, CORS and credential distribution are painful, and per-project
  authorization would have to be replicated in Prometheus.
- **Keep accumulating in the browser** (what the prototype does). Works, but
  history is lost on reload, capped by tab memory, and never covers the time
  before the page was opened.
- **Embed Grafana.** Heavyweight, separate auth domain, and doesn't help API
  clients other than the UI.
