import { describe, expect, it } from "vitest";
import { ThreadHistoryDisplay } from "./thread-history-display.js";
import type { HistoryEvent } from "./thread-pool.js";
import { captureOutput } from "./test-helpers/application.js";

describe("TestThreadHistoryDisplay", () => {
  const time = 1_000_000;
  const event = (type: string, data: Record<string, unknown> = {}): HistoryEvent => ({
    event: type,
    time: time / 1_000_000.0,
    data,
    thread: "main",
  });
  const show = async (stats: HistoryEvent[]) => {
    const [out] = await captureOutput(async () => new ThreadHistoryDisplay(stats).show());
    return out;
  };

  it("banner", async () => {
    expect(await show([])).toMatch(/Job History/i);
  });

  it("item queued", async () => {
    const out = await show([event("item_queued", { item_id: 123 })]);
    expect(out).toMatch(/^ *1000000 +A +item_queued +item_id:1$/m);
  });

  it("item dequeued", async () => {
    const out = await show([event("item_dequeued", { item_id: 123 })]);
    expect(out).toMatch(/^ *1000000 +A +item_dequeued +item_id:1$/m);
  });

  it("multiple items", async () => {
    const out = await show([
      event("item_queued", { item_id: 123 }),
      event("item_queued", { item_id: 124 }),
    ]);
    expect(out).toMatch(/^ *1000000 +A +item_queued +item_id:1$/m);
    expect(out).toMatch(/^ *1000000 +A +item_queued +item_id:2$/m);
  });

  it("waiting", async () => {
    const out = await show([event("waiting", { item_id: 123 })]);
    expect(out).toMatch(/^ *1000000 +A +waiting +item_id:1$/m);
  });

  it("continue", async () => {
    const out = await show([event("continue", { item_id: 123 })]);
    expect(out).toMatch(/^ *1000000 +A +continue +item_id:1$/m);
  });

  it("thread deleted", async () => {
    const out = await show([
      event("thread_deleted", { deleted_thread: 123_456, thread_count: 12 }),
    ]);
    expect(out).toMatch(/^ *1000000 +A +thread_deleted( +deleted_thread:B| +thread_count:12){2}$/m);
  });

  it("thread created", async () => {
    const out = await show([event("thread_created", { new_thread: 123_456, thread_count: 13 })]);
    expect(out).toMatch(/^ *1000000 +A +thread_created( +new_thread:B| +thread_count:13){2}$/m);
  });
});
