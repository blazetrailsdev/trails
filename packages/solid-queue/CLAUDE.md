# @blazetrails/solid-queue — Claude guide

## `Record`'s class body runs in a `solid_queue_record` load hook (`record.rb:7`)

`SolidQueue::Record`'s class body line
`connects_to(**SolidQueue.connects_to) if SolidQueue.connects_to`
(`vendor/solid_queue/v1.7.2/app/models/solid_queue/record.rb:7`) runs from the
`solid_queue.config` initializer in trails, not from `record.ts`. Rails reads
it when Zeitwerk first loads the class, which is after the `solid_queue.config`
initializer (`vendor/solid_queue/v1.7.2/lib/solid_queue/engine.rb:13-17`) has
copied `config.solid_queue` onto `SolidQueue`. ESM evaluates `record.ts` as
soon as the package entry is imported, before any initializer, because framework
packages stay ES modules and only application code goes through Zeitwerk
(`packages/trailties/CLAUDE.md` § "The application loader is Zeitwerk").
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

## `FiberPool` inlines the `async` gem (`fiber_pool.rb`)

`SolidQueue::FiberPool` (`vendor/solid_queue/v1.7.2/lib/solid_queue/fiber_pool.rb`)
runs its executions under the `async` gem. trails does not port `async`; by
operator ruling on 2026-11-17 its two uses are inlined into `FiberPool`:

- **`Async { |task| ... }` and `Async::Semaphore.new(size, parent: task)`**
  (`fiber_pool.rb:79-94`) are the reactor `Thread`'s own body, a
  ruby-compat `Concurrent::Semaphore`, and a set of child promises the body
  awaits before it exits. `semaphore.async(execution) { ... }`
  (`fiber_pool.rb:101-105`) acquires a permit, runs `perform_execution` in a
  ruby-compat `Fiber`, and releases the permit when it ends, as
  `Async::Semaphore#async` does.
- **`rescue Async::Stop`** (`fiber_pool.rb:110-112`) is dropped. Nothing in
  trails raises `Async::Stop`, so `FiberPool` does not override
  `perform_execution`, and `register_fatal_error` is reached only from the
  reactor's own rescue. "marks the pool as fatal when an execution is
  cancelled" (`test/unit/fiber_pool_test.rb`) is parked as `it.skip` under a
  `PERMANENT-SKIP:` line citing this section.

`ensure_fiber_workers_have_required_dependency` (`configuration.rb:136-143`)
is not ported: its `require "async"` has no npm analogue.
