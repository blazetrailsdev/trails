# WS2: Music Tutorial

## Dependencies

- WS1 PRs 1–6 merged (types, diff engine, fixtures, UI components, routes, Monaco)
- Can run in parallel with WS3

## Approach

TDD. Content is validated by automated replay tests that boot a runtime, execute every action, and assert every checkpoint. Tests run in CI — a change to `trail-cli.ts` or `activerecord` that breaks the Music tutorial fails the build.

---

## PR Sequence

### PR 1: Music steps 1–5 (data modeling)

**Write tests first:**

```
src/lib/frontiers/tutorials/music/
  music-replay.test.ts  — Boots createRuntime(), replays steps 1–5:
                          Step 1: exec("new music"), assert scaffold files exist
                          Step 2: exec("generate model Artist ..."),
                                  exec("generate model Album ..."),
                                  exec("db:migrate"),
                                  assert tables artists + albums exist
                          Step 3: exec("generate model Track ..."),
                                  exec("generate model Genre ..."),
                                  exec("generate migration CreateGenresTracks ..."),
                                  exec("db:migrate"),
                                  assert tables tracks + genres + genres_tracks exist
                          Step 4: exec("generate model Playlist ..."),
                                  exec("generate migration CreatePlaylistTracks ..."),
                                  exec("db:migrate"),
                                  assert tables playlists + playlist_tracks exist
                          Step 5: applyAllDiffs to 5 model files,
                                  assert all model files contain association declarations

                          Also validates:
                          - Every step has prose + diagram + actions (rule of threes)
                          - Every step has a panes array
                          - Every diff anchor resolves against actual file content
                          - Diagrams are valid mermaid syntax
```

**Then implement:**

```
src/lib/frontiers/tutorials/
  registry.ts           — Update Music entry with real stepCount, wire loadSteps
  music/
    index.ts
    steps/
      step-01.ts        — "Setting Up"
                          Panes: terminal, file-tree, editor, console
                          CLI: new music
                          Diagram: flow — overview of the 5-entity data model
      step-02.ts        — "Artists and Albums"
                          Panes: terminal, file-tree, editor, database, console
                          CLI: generate model Artist/Album, db:migrate
                          Diagram: ER — Artist → Album
      step-03.ts        — "Tracks and Genres"
                          Panes: terminal, file-tree, editor, database, console
                          Concept: many-to-many via join tables
                          CLI: generate Track, Genre, migration, db:migrate
                          Diagram: ER — Album → Track ↔ Genre via genres_tracks
      step-04.ts        — "Playlists"
                          Panes: terminal, file-tree, editor, database, console
                          Concept: join tables with extra columns (position)
                          CLI: generate Playlist, migration, db:migrate
                          Diagram: ER — Playlist ↔ Track with position
      step-05.ts        — "Associations Deep Dive"
                          Panes: file-tree, editor, database, console
                          Concept: hasMany through, hasAndBelongsToMany
                          Diffs: associations on all 5 models using anchors
                          Diagram: full ER with all relationship arrows
```

**Anchor examples for step 5:**

```typescript
// In app/models/artist.ts, after the last attribute line:
{
  anchor: 'this.attribute("updated_at"',
  position: "after",
  insertLines: [
    '    this.hasMany("albums");',
    '    this.hasMany("tracks", { through: "albums" });',
  ],
}
```

**Review criteria:**

- `music-replay.test.ts` passes for steps 1–5
- Rule of threes enforced by test
- Anchors validated against generator fixtures from WS1 PR 2
- Join table migrations include both foreign keys (and position for playlist_tracks)

---

### PR 2: Music steps 6–10 (seeds, controllers, API)

**Write tests first — extend replay test:**

```
src/lib/frontiers/tutorials/music/
  music-replay.test.ts  — Extend to replay steps 6–10 after 1–5:
                          Step 6: applyDiff for seeds.ts, exec("db:seed"),
                                  assert row counts (artists 5+, tracks 50+, genres 5+)
                                  Validate: all foreign keys in seeds reference valid IDs
                                  Validate: genres_tracks join rows reference existing genres/tracks
                          Step 7: applyDiffs for 3 controllers + routes, exec("server"),
                                  assert GET /artists → 200, GET /artists/1/albums → 200
                          Step 8: applyDiffs updating controllers,
                                  assert GET /artists returns album counts,
                                  assert GET /albums/1 returns tracks array
                          Step 9: applyDiffs for search actions + routes, exec("server"),
                                  assert GET /artists/search?q=a → 200
                          Step 10: applyDiffs for playlist controller + routes, exec("server"),
                                   assert all core routes respond 200
```

**Then implement:**

```
src/lib/frontiers/tutorials/music/steps/
  step-06.ts            — "Seeding a Music Library"
                          Panes: terminal, file-tree, editor, database, console
                          Diff: db/seeds.ts with realistic data:
                            5 artists, 15 albums, 60 tracks, 8 genres,
                            genre assignments, 3 playlists with ordered tracks
                          CLI: db:seed
                          Diagram: flow — seed data counts per entity
  step-07.ts            — "Controllers and Routing"
                          Panes: terminal, file-tree, editor, results, console
                          Concept: RESTful resources (index/show/create/destroy)
                          Diffs: ArtistsController, AlbumsController, TracksController, routes
                          CLI: server
                          Diagram: flow — route table
  step-08.ts            — "List and Detail Views"
                          Panes: file-tree, editor, results, database, console
                          Diffs: update controllers with richer queries
                            (album counts via subquery, tracks with formatted duration)
                          Diagram: flow — index response vs show response shapes
  step-09.ts            — "Search and Filtering"
                          Panes: file-tree, editor, results, sql, console
                          Concept: query params, LIKE queries
                          Diffs: search action, genre filter, custom routes
                          Diagram: flow — search request with params → LIKE → results
  step-10.ts            — "Bringing It Together"
                          Panes: terminal, file-tree, editor, results, database, sql, console
                          Diffs: PlaylistsController (index, show with ordered tracks,
                                 add_track, remove_track), playlist routes
                          CLI: server
                          Diagram: ER — final complete model
```

**Seed data quality (enforced by test):**

- Artist/album/track names are realistic (not "Artist 1")
- Duration values are reasonable (120–400 seconds)
- Foreign keys form valid chains (album.artist_id → existing artist, etc.)
- Playlist track positions are sequential (1, 2, 3...)
- Genre assignments cover multiple genres per track

**Review criteria:**

- Full 10-step replay test passes
- Seed data FK integrity validated by test
- Search uses parameterized `LIKE '%' || ? || '%'` (SQLite safe)
- All controller SQL uses parameterized queries
- Playlist ordering uses ORDER BY position

---

### PR 3: Static tutorial snapshot

**Size:** 1 static file. Tiny. **Depends on PR 2.**

Extend `scripts/build-tutorial-snapshots.ts` to include Music. Run full replay, export to `packages/website/static/tutorials/music.sqlite`.

**Test:** Replay test already validates the final state. The snapshot builder reuses it.

---

## Parallelization

```
PR 1 ──→ PR 2 ──→ PR 3
(1–5)    (6–10)   (.sqlite)
```

Sequential within WS2 (content builds on itself), but **WS2 runs in parallel with WS3** — they share `registry.ts` and `scripts/build-tutorial-snapshots.ts`. To avoid merge conflicts, WS1 pre-stubs the Music and Finances entries in those shared files so WS2/WS3 PRs only fill in per-tutorial modules.

---

## Test Summary

| PR  | Tests                         | What they verify                                                         |
| --- | ----------------------------- | ------------------------------------------------------------------------ |
| 1   | `music-replay.test.ts` (1–5)  | Generator output, anchors resolve, tables created, associations declared |
| 2   | `music-replay.test.ts` (6–10) | Seed FK integrity, SQL validity, API responses, search, full replay      |
| 3   | (reuses replay)               | Snapshot loads and final state checks pass                               |

The replay test is the single source of truth. If it passes, the tutorial works.
