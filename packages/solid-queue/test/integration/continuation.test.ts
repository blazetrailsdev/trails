import { describe, it } from "vitest";

describe("ContinuationTest", () => {
  // BLOCKED: activejob-continuation-v8-1 — ActiveJob::Continuation is not in the vendored activejob v8.0.2, so Rails' own file returns on its LoadError (continuation_test.rb:5-9).
  it.skip("continuable job completes", () => {});

  // BLOCKED: activejob-continuation-v8-1 — ActiveJob::Continuation is not in the vendored activejob v8.0.2, so Rails' own file returns on its LoadError (continuation_test.rb:5-9).
  it.skip("continuable job can be interrupted and resumed", () => {});
});
