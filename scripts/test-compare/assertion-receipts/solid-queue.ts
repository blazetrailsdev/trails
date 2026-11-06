import type { AssertionReceipt } from "../assertion-receipts.js";

export const solidQueue: Record<string, AssertionReceipt[]> = {
  "solid-queue:unit/supervisor_test.rb › SupervisorTest › abort if there's already a pidfile for a supervisor":
    [
      {
        kind: "assert_not_equal",
        value: null,
        as: null,
        reason:
          "supervisor_test.rb:84 compares the forked supervisor's pid against the parent's pid in the pidfile; Node has no `fork`, so the supervisor runs in-process under the same pid (CLAUDE.md § \"Runtime facts Node does not expose\").",
      },
    ],
  "solid-queue:unit/supervisor_test.rb › SupervisorTest › delete previous pidfile if the owner is dead":
    [
      {
        kind: "assert",
        value: null,
        as: null,
        reason:
          'supervisor_test.rb:94-97 `KILL`s a forked supervisor and reads the pidfile it left behind; Node has no `fork`, and the in-process supervisor cannot be killed without killing the test (CLAUDE.md § "Runtime facts Node does not expose").',
      },
      {
        kind: "assert_equal",
        value: null,
        as: null,
        reason:
          'supervisor_test.rb:94-97 `KILL`s a forked supervisor and reads the pidfile it left behind; Node has no `fork`, and the in-process supervisor cannot be killed without killing the test (CLAUDE.md § "Runtime facts Node does not expose").',
      },
    ],
};
