## Hand-written entry points

`solid_queue:install` writes `bin/jobs`. If you write your own entry point, load job classes
with a dynamic `import()` after the boot:

```ts
import "../config/environment.ts";

await import("../app/jobs/index.ts");
```

`config/environment.ts` awaits `Trails.initialize()` at its top level, and a sibling static
import does not wait for that. A job class imported statically evaluates before the engine's
`solid_queue.active_job.extensions` initializer runs, and `this.limitsConcurrency` is not a
function. Ruby's `require` runs in sequence, so Rails has no such trap.
