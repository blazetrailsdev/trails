# @blazetrails/solid-queue — Claude guide

## `Record`'s class body runs in a `solid_queue_record` load hook (`record.rb:7`)

`SolidQueue::Record`'s class body line
`connects_to(**SolidQueue.connects_to) if SolidQueue.connects_to`
(`vendor/solid_queue/v1.1.3/app/models/solid_queue/record.rb:7`) runs from the
`solid_queue.config` initializer in trails, not from `record.ts`. Rails reads
it when Zeitwerk first loads the class, which is after the `solid_queue.config`
initializer (`vendor/solid_queue/v1.1.3/lib/solid_queue/engine.rb:13-17`) has
copied `config.solid_queue` onto `SolidQueue`. ESM evaluates `record.ts` as
soon as the package entry is imported, before any initializer, and trails has no
autoloader (`packages/trailties/CLAUDE.md` § "Trails has no autoloader").
An engine-driven deferred load of `app/models` was considered and rejected: it
needs a loader with no Rails body to mirror, and still runs only under
`config.eager_load`. The `solid_queue_record` load hook this section's heading
names is now only the `run_load_hooks` call at `record.rb:19`.

**The line runs from the `solid_queue.config` initializer**, which awaits
`Record.connectsTo(SolidQueue.connectsTo)` when `connectsTo` is set, after it
has copied `config.solid_queue` onto `SolidQueue`. A `solid_queue_record` load
hook was used before, but `connectsTo` is async and load hooks are synchronous,
so its promise floated; solid-cable's `solid_cable.config` initializer awaits
the same call (trails#9459). `record.ts` still runs
`runLoadHooks("solid_queue_record", Record)`, as `record.rb`'s last line does.
`Record` carries `@missingRailsCall connectsTo — PERMANENT` and `Engine`
carries `@inventedArm connectsTo — PERMANENT` against this section.

`record.ts`'s `this.tableNamePrefix = SolidQueue.tableNamePrefix` has no line
in `record.rb`. Rails gets the prefix from the reader `isolate_namespace`
defines on `SolidQueue`
(`vendor/rails/v8.0.2/railties/lib/rails/engine.rb:396-398`) through
`full_table_name_prefix`'s `module_parents` walk. Rails defines no
`table_name_prefix=` writer, so a `config.solid_queue.table_name_prefix` raises
`NoMethodError` in the `solid_queue.config` initializer, and there is no
configured prefix to honour. The walk needs the models named `SolidQueue::…`,
filed as `solid-queue-models-named-under-solid-queue-namespace`.
