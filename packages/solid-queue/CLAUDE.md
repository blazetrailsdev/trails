# @blazetrails/solid-queue — Claude guide

## `Record`'s class body runs in a `solid_queue_record` load hook (`record.rb:7`)

`SolidQueue::Record`'s class body runs
`connects_to(**SolidQueue.connects_to) if SolidQueue.connects_to`
(`vendor/solid_queue/v1.1.3/app/models/solid_queue/record.rb:7`). Rails reads
it when Zeitwerk first loads the class, which is after the `solid_queue.config`
initializer (`vendor/solid_queue/v1.1.3/lib/solid_queue/engine.rb:13-17`) has
copied `config.solid_queue` onto `SolidQueue`. ESM evaluates `record.ts` as
soon as the package entry is imported, before any initializer, and trails has no
autoloader (`packages/trailties/CLAUDE.md` § "Trails has no autoloader").
An engine-driven deferred load of `app/models` was considered and rejected: it
needs a loader with no Rails body to mirror, and still runs only under
`config.eager_load`.

**The `solid_queue.config` initializer registers a `runOnce`
`onLoad("solid_queue_record")` hook** that runs the class-body line against the
configured `SolidQueue`. `Record` carries `@missingRailsCall connectsTo —
PERMANENT` and `Engine` carries `@inventedArm onLoad — PERMANENT` against this
section. Ruled by the repo owner on 2026-10-26.

`record.ts`'s `this.tableNamePrefix = SolidQueue.tableNamePrefix` has no line
in `record.rb`. Rails gets the prefix from the reader `isolate_namespace`
defines on `SolidQueue`
(`vendor/rails/v8.0.2/railties/lib/rails/engine.rb:396-398`) through
`full_table_name_prefix`'s `module_parents` walk. Rails defines no
`table_name_prefix=` writer, so a `config.solid_queue.table_name_prefix` raises
`NoMethodError` in the `solid_queue.config` initializer, and there is no
configured prefix to honour. The walk needs the models named `SolidQueue::…`,
filed as `solid-queue-models-named-under-solid-queue-namespace`.
