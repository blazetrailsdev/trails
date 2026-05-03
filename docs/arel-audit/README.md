## Arel audit (file-by-file vs Rails 8.0.2)

Rails source: `activerecord-8.0.2/lib/arel/`. Ours: `packages/arel/src/`.

Status legend:

- **OK** — structure matches; minor diff only.
- **GAP** — missing method/behavior worth porting.
- **EXTRA** — present in ours but not in Rails (verify needed/correct).
- **DRIFT** — diverges from Rails layout/semantics.

Sections:

- [top-level.md](top-level.md) — `alias_predication`, `crud`, `delete_manager`, `errors`, `expressions`, `factory_methods`, `filter_predications`, `insert_manager`, `math`, `order_predications`, `predications`, `select_manager`, `table`, `tree_manager`, `update_manager`, `window_predications`.
- [nodes.md](nodes.md) — every file under `nodes/`.
- [visitors.md](visitors.md) — every file under `visitors/`.
- [attributes-collectors.md](attributes-collectors.md) — `attributes/`, `collectors/`.
- [extras.md](extras.md) — files present in ours that aren't in Rails (`predications-range`, `quote-array`, split-out node files `and`/`or`).
- [summary.md](summary.md) — confirmed behavioral GAPs, necessary TS deviations, api:compare housekeeping notes.
