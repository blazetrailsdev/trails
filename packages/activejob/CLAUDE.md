# activejob — Claude guide

Rules that bind only inside `packages/activejob`. The repo-wide rules, the
fidelity standard and the pre-PR checklist are in the root
[CLAUDE.md](../../CLAUDE.md), which also keeps every heading below as a
pointer so code citations of the form `CLAUDE.md, "Section title"` resolve.
A `§ "…"` reference below names a section of the root file unless it names
one in this file.

## A job's `perform` and `enqueue` are async (`perform_now` / `perform_later`)

Rails runs a job synchronously. `Execution#perform_now`
(`vendor/rails/v8.0.2/activejob/lib/active_job/execution.rb:45-58`) bumps
`executions`, deserializes the arguments and calls `_perform_job`, which runs
`perform(*arguments)` inside `run_callbacks :perform` (`:65-70`); its
`rescue Exception` hands any error to `rescue_with_handler`, and returns the
handler's value. `ClassMethods#perform_now` (`:22-24`) and `execute(job_data)`
(`:26-31`) reach it, and `perform_later` / `enqueue`
(`enqueuing.rb:81-88`, `:112-125`) hand the job to an adapter the same way.

A job body does I/O, and in trails every AR read and every
`GlobalID::Locator.locate` is awaited, so `perform` returns a promise. JS has
no synchronous await: a sync `perform_now` would return before the body
settles, run the `:perform` after-callbacks first, and leave a rejection
outside its `rescue`. **`perform_now`, `execute`, `perform_later`, `enqueue`,
`raw_enqueue` and `ActiveJob.perform_all_later` are `async`**, and each awaits
the step Ruby runs in line: `_perform_job` inside `run_callbacks(:perform)`,
the rejection inside the `catch` that is `rescue Exception`, an async
`rescue_from` handler before `return handled if handled`, and an adapter's
`enqueue` / `enqueue_at` / `enqueue_all`. `perform_later`'s block is captured
and awaited, as § "A create path awaits its block before saving" settles for
`create`. `Arguments.deserialize` is async for the same reason.

A sync `perform_now` with an async twin was rejected (RFC
`0169-activejob-package-port`, "Alternatives considered"): every useful job
body awaits a query, so the sync form either drops the promise or needs a
second, invented API. The members with no I/O stay sync: `queue_name`,
`priority`, `serialize`, instance `deserialize`, `set`, `job_or_instantiate`,
and the `TestAdapter` readers.

This is a genuine language shortcoming, ratified repo-wide here. Every async
job member cites this section; a new instance is not a new decision to argue.
