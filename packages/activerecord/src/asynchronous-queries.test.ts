import { describe, it } from "vitest";

describe("AsynchronousQueriesTest", () => {
  it.skip("async select all", () => {
    // BLOCKED: load-async — FutureResult / async query infrastructure not implemented
    // ROOT-CAUSE: future-result.ts#FutureResult not implemented; Relation#loadAsync missing
    // SCOPE: ~150 LOC in future-result.ts + relation.ts; affects ~31 tests in load-async.test.ts
  });
});

describe("AsynchronousExecutorTypeTest", () => {
  it.skip("null configuration uses a single null executor by default", () => {
    // BLOCKED: load-async — FutureResult / async query infrastructure not implemented
    // ROOT-CAUSE: future-result.ts#FutureResult not implemented; Relation#loadAsync missing
    // SCOPE: ~150 LOC in future-result.ts + relation.ts; affects ~31 tests in load-async.test.ts
  });
  it.skip("one global thread pool is used when set with default concurrency", () => {
    // BLOCKED: load-async — FutureResult / async query infrastructure not implemented
    // ROOT-CAUSE: future-result.ts#FutureResult not implemented; Relation#loadAsync missing
    // SCOPE: ~150 LOC in future-result.ts + relation.ts; affects ~31 tests in load-async.test.ts
  });
  it.skip("concurrency can be set on global thread pool", () => {
    // BLOCKED: load-async — FutureResult / async query infrastructure not implemented
    // ROOT-CAUSE: future-result.ts#FutureResult not implemented; Relation#loadAsync missing
    // SCOPE: ~150 LOC in future-result.ts + relation.ts; affects ~31 tests in load-async.test.ts
  });
  it.skip("concurrency cannot be set with null executor or multi thread pool", () => {
    // BLOCKED: load-async — FutureResult / async query infrastructure not implemented
    // ROOT-CAUSE: future-result.ts#FutureResult not implemented; Relation#loadAsync missing
    // SCOPE: ~150 LOC in future-result.ts + relation.ts; affects ~31 tests in load-async.test.ts
  });
  it.skip("multi thread pool executor configuration", () => {
    // BLOCKED: load-async — FutureResult / async query infrastructure not implemented
    // ROOT-CAUSE: future-result.ts#FutureResult not implemented; Relation#loadAsync missing
    // SCOPE: ~150 LOC in future-result.ts + relation.ts; affects ~31 tests in load-async.test.ts
  });
  it.skip("multi thread pool is used only by configurations that enable it", () => {
    // BLOCKED: load-async — FutureResult / async query infrastructure not implemented
    // ROOT-CAUSE: future-result.ts#FutureResult not implemented; Relation#loadAsync missing
    // SCOPE: ~150 LOC in future-result.ts + relation.ts; affects ~31 tests in load-async.test.ts
  });
});

it.skip("async select failure", () => {
  // BLOCKED: load-async — FutureResult / async query infrastructure not implemented
  // ROOT-CAUSE: future-result.ts#FutureResult not implemented; Relation#loadAsync missing
  // SCOPE: ~150 LOC in future-result.ts + relation.ts; affects ~31 tests in load-async.test.ts
});
it.skip("async query from transaction", () => {
  // BLOCKED: load-async — FutureResult / async query infrastructure not implemented
  // ROOT-CAUSE: future-result.ts#FutureResult not implemented; Relation#loadAsync missing
  // SCOPE: ~150 LOC in future-result.ts + relation.ts; affects ~31 tests in load-async.test.ts
});
it.skip("async query cache", () => {
  // BLOCKED: load-async — FutureResult / async query infrastructure not implemented
  // ROOT-CAUSE: future-result.ts#FutureResult not implemented; Relation#loadAsync missing
  // SCOPE: ~150 LOC in future-result.ts + relation.ts; affects ~31 tests in load-async.test.ts
});
it.skip("async query foreground fallback", () => {
  // BLOCKED: load-async — FutureResult / async query infrastructure not implemented
  // ROOT-CAUSE: future-result.ts#FutureResult not implemented; Relation#loadAsync missing
  // SCOPE: ~150 LOC in future-result.ts + relation.ts; affects ~31 tests in load-async.test.ts
});
