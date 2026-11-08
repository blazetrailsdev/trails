/**
 * Entries scoped to `package: "solid-queue"`. The `package` field, not this file's
 * name, is what scopes the match. Schema: ./types.ts.
 */

import type { UnportedFile } from "./types.js";

export const SOLID_QUEUE_UNPORTED_FILES: UnportedFile[] = [
  {
    package: "solid-queue",
    pattern: "processes/og_interruptible.rb",
    reason:
      "The Ruby < 3.2 fallback for Processes::Interruptible, included only when " +
      "`RUBY_VERSION` is below 3.2 (solid_queue engine.rb:42-48); trails has one " +
      "runtime and always takes the Interruptible arm.",
  },
];
