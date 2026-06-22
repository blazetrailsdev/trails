/**
 * THROWAWAY INSTRUMENTATION — vitest setup hook for the DDL timing profiler.
 * Only wired into the suite when DDL_PROFILE=1 (see vitest.config.ts). Installs
 * the adapter-prototype patches in {@link ./test-helpers/ddl-profile.ts}.
 */
import { afterAll, beforeEach, expect } from "vitest";
import { install, flush, setCurrentFile, setTestPathResolver } from "./test-helpers/ddl-profile.js";

await install();

// Primary attribution: vitest sets expect.getState().testPath throughout a
// file's lifecycle (including beforeAll, where heavy defineSchema DDL runs).
setTestPathResolver(() => expect.getState().testPath ?? undefined);

// Fallback for any DDL emitted outside a test's expect state.
beforeEach((ctx) => {
  setCurrentFile(ctx?.task?.file?.filepath);
});

// vitest kills forked workers without a clean exit, so flush the cumulative
// summary from a root-level afterAll (runs after every test file in this
// worker). Overwrites the worker's output file each time, so the final write
// holds every record this worker saw.
afterAll(() => {
  flush();
});
