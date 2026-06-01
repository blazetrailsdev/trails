# Connection-pooled test adapter — Rails-parity epic

**Status: Phases A–F complete (2026-05-28).** Phase G (fixture adoption) is ongoing — tracked in [`fixtures-adoption-plan.md`](fixtures-adoption-plan.md).

| Phase                                       | PRs                        | What shipped                                                                                                                              |
| ------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| A0 spike, B, C                              | #2242, #2245               | Initial pooled adapter + sidecar                                                                                                          |
| D-X driver-pool collapse                    | #2278 (MySQL), #2279 (PG)  | Single connection per adapter, Rails-shape                                                                                                |
| D-Y canonical schema                        | #2372                      | Per-worker preload + additive `defineSchema` fast-path                                                                                    |
| D-1..N bypass elimination                   | ~97 files                  | `Model.adapter = X` bypass cleared across test suite                                                                                      |
| E — delete singleton/AsyncContext filter    | #2514, #2527, #2533, #2536 | `_sharedAdapter`, `_txLockStorage`, `_manualTxDepth`, `_txVisible` deleted                                                                |
| F — DDL tracking removal + wrapper deletion | #2537, #2538, #2545 + main | `recordDdlTracking`, `_createdTables`, `ddl-tracker.ts`, `TestAdapterFixtures`, `SidecarFixtures`, `createTestAdapter()` shim all deleted |

**End state:** No `_sharedAdapter`, no `_txLockStorage`/`_manualTxDepth`/`_txVisible`, no
`recordDdlTracking`/`ddl-tracker.ts`, no `TestAdapterFixtures`/`SidecarFixtures` wrappers,
no Proxy. `createTestAdapter()` returns the raw pool-leased `DatabaseAdapter`. Full Rails
parity on connection model.

**Remaining follow-up:** `adapter-cleanup-plan.md` tracks 3 PRs (A/B/C) that delete the
`adapter.ts` barrel and `DatabaseAdapter` interface, gated on Phase G adoption clearing
the remaining import sites.
