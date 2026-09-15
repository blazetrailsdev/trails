import { beforeEach, describe, expect, it } from "vitest";

import { benchmark as benchmarkFn, type BenchmarkOptions } from "./benchmarkable.js";
import { Logger } from "./logger.js";
import { assertDifference, assertEmpty, assertRaise } from "./testing/assertions.js";

describe("BenchmarkableTest", () => {
  class Buffer {
    lines: string[] = [];
    write(x: string): void {
      this.lines.push(x);
    }
    close(): void {}
    last(): string | undefined {
      return this.lines.at(-1);
    }
    get size(): number {
      return this.lines.length;
    }
    count(): number {
      return this.lines.length;
    }
  }

  let buffer: Buffer;
  let logger: Logger;

  function benchmark(...args: unknown[]): unknown {
    return (benchmarkFn as (...a: unknown[]) => unknown).apply({ logger }, args);
  }

  function assertLastLogged(message = "Benchmarking"): void {
    expect(buffer.last()).toMatch(new RegExp(`^${message} \\(.*\\)\\n?$`));
  }

  beforeEach(() => {
    buffer = new Buffer();
    logger = new Logger(buffer);
  });

  it("without block", async () => {
    await assertRaise([TypeError], {}, () => benchmark());
    assertEmpty(buffer);
  });

  it("defaults", () => {
    let iWasRun = false;
    benchmark(() => {
      iWasRun = true;
    });
    expect(iWasRun).toBeTruthy();
    assertLastLogged();
  });

  it("with message", () => {
    let iWasRun = false;
    benchmark("test_run", () => {
      iWasRun = true;
    });
    expect(iWasRun).toBeTruthy();
    assertLastLogged("test_run");
  });

  it("with silence", async () => {
    await assertDifference(
      () => buffer.count(),
      +2,
      null,
      () => {
        benchmark("test_run", () => {
          logger.info("SOMETHING");
        });
      },
    );

    await assertDifference(
      () => buffer.count(),
      +1,
      null,
      () => {
        benchmark("test_run", { silence: true } satisfies BenchmarkOptions, () => {
          logger.info("NOTHING");
        });
      },
    );
  });

  it("within level", () => {
    logger.level = Logger.DEBUG;
    benchmark("included_debug_run", { level: "debug" }, () => {});
    assertLastLogged("included_debug_run");
  });

  it("outside level", () => {
    try {
      logger.level = Logger.ERROR;
      benchmark("skipped_debug_run", { level: "debug" }, () => {});
      expect(buffer.last() ?? "").not.toMatch(/skipped_debug_run/);
    } finally {
      logger.level = Logger.DEBUG;
    }
  });
});
