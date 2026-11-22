/**
 * Entries scoped to `package: "listen"`. Schema: ./types.ts.
 */

import type { UnportedFile } from "./types.js";

const PARCEL_WATCHER =
  "PERMANENT: @parcel/watcher supplies listen's backends, event queue and change records; operator ruling 2026-11-22 (listen-wraps-parcel-watcher).";

export const LISTEN_UNPORTED_FILES: UnportedFile[] = [
  {
    pattern: "/adapter/base.rb",
    testFile: "/adapter/base_spec.rb",
    package: "listen",
    reason: PARCEL_WATCHER,
  },
  {
    pattern: "/adapter/bsd.rb",
    testFile: "/adapter/bsd_spec.rb",
    package: "listen",
    reason: PARCEL_WATCHER,
  },
  {
    pattern: "/adapter/config.rb",
    testFile: "/adapter/config_spec.rb",
    package: "listen",
    reason: PARCEL_WATCHER,
  },
  {
    pattern: "/adapter/darwin.rb",
    testFile: "/adapter/darwin_spec.rb",
    package: "listen",
    reason: PARCEL_WATCHER,
  },
  {
    pattern: "/adapter/linux.rb",
    testFile: "/adapter/linux_spec.rb",
    package: "listen",
    reason: PARCEL_WATCHER,
  },
  {
    pattern: "/adapter/polling.rb",
    testFile: "/adapter/polling_spec.rb",
    package: "listen",
    reason: PARCEL_WATCHER,
  },
  {
    pattern: "/adapter.rb",
    testFile: "/adapter_spec.rb",
    package: "listen",
    reason: PARCEL_WATCHER,
  },
  {
    pattern: "/adapter/windows.rb",
    testFile: "/adapter/windows_spec.rb",
    package: "listen",
    reason: PARCEL_WATCHER,
  },
  {
    pattern: "/backend.rb",
    testFile: "/backend_spec.rb",
    package: "listen",
    reason: PARCEL_WATCHER,
  },
  { pattern: "/change.rb", testFile: "/change_spec.rb", package: "listen", reason: PARCEL_WATCHER },
  { pattern: "/cli.rb", testFile: "/cli_spec.rb", package: "listen", reason: PARCEL_WATCHER },
  {
    pattern: "/directory.rb",
    testFile: "/directory_spec.rb",
    package: "listen",
    reason: PARCEL_WATCHER,
  },
  { pattern: "/error.rb", package: "listen", reason: PARCEL_WATCHER },
  {
    pattern: "/event/config.rb",
    testFile: "/event/config_spec.rb",
    package: "listen",
    reason: PARCEL_WATCHER,
  },
  {
    pattern: "/event/loop.rb",
    testFile: "/event/loop_spec.rb",
    package: "listen",
    reason: PARCEL_WATCHER,
  },
  {
    pattern: "/event/processor.rb",
    testFile: "/event/processor_spec.rb",
    package: "listen",
    reason: PARCEL_WATCHER,
  },
  {
    pattern: "/event/queue.rb",
    testFile: "/event/queue_spec.rb",
    package: "listen",
    reason: PARCEL_WATCHER,
  },
  { pattern: "/file.rb", testFile: "/file_spec.rb", package: "listen", reason: PARCEL_WATCHER },
  { pattern: "/fsm.rb", testFile: "/fsm_spec.rb", package: "listen", reason: PARCEL_WATCHER },
  {
    pattern: "/listener/config.rb",
    testFile: "/listener/config_spec.rb",
    package: "listen",
    reason: PARCEL_WATCHER,
  },
  { pattern: "/logger.rb", testFile: "/logger_spec.rb", package: "listen", reason: PARCEL_WATCHER },
  {
    pattern: "/monotonic_time.rb",
    testFile: "/monotonic_time_spec.rb",
    package: "listen",
    reason: PARCEL_WATCHER,
  },
  { pattern: "/options.rb", package: "listen", reason: PARCEL_WATCHER },
  {
    pattern: "/queue_optimizer.rb",
    testFile: "/queue_optimizer_spec.rb",
    package: "listen",
    reason: PARCEL_WATCHER,
  },
  { pattern: "/record/entry.rb", package: "listen", reason: PARCEL_WATCHER },
  { pattern: "/record.rb", testFile: "/record_spec.rb", package: "listen", reason: PARCEL_WATCHER },
  { pattern: "/record/symlink_detector.rb", package: "listen", reason: PARCEL_WATCHER },
  {
    pattern: "/silencer/controller.rb",
    testFile: "/silencer/controller_spec.rb",
    package: "listen",
    reason: PARCEL_WATCHER,
  },
  {
    pattern: "/silencer.rb",
    testFile: "/silencer_spec.rb",
    package: "listen",
    reason: PARCEL_WATCHER,
  },
  { pattern: "/thread.rb", testFile: "/thread_spec.rb", package: "listen", reason: PARCEL_WATCHER },
  { pattern: "/version.rb", package: "listen", reason: PARCEL_WATCHER },
  { testFile: "/acceptance/listen_spec.rb", package: "listen", reason: PARCEL_WATCHER },
];
