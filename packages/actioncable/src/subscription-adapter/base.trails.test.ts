import { NotImplementedError, Process } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { Base } from "./base.js";

describe("SubscriptionAdapter::Base", () => {
  it("rejects the adapter methods with NotImplementedError", async () => {
    const base = new Base({ logger: "log", config: { cable: {} } });
    expect(base.logger).toBe("log");
    await expect(base.broadcast("c", "p")).rejects.toBeInstanceOf(NotImplementedError);
    await expect(base.subscribe("c", () => {})).rejects.toBeInstanceOf(NotImplementedError);
    await expect(base.unsubscribe("c", () => {})).rejects.toBeInstanceOf(NotImplementedError);
    await expect(base.shutdown()).rejects.toBeInstanceOf(NotImplementedError);
  });

  it("identifier writes its default back to the config", () => {
    const cable: Record<string, unknown> = {};
    const server = { logger: null, config: { cable } };
    expect(new Base(server).identifier()).toBe(`ActionCable-PID-${Process.pid}`);
    expect(cable.id).toBe(`ActionCable-PID-${Process.pid}`);
    cable.id = "custom";
    expect(new Base(server).identifier()).toBe("custom");
  });
});

describe("SubscriptionAdapter::Base#identifier", () => {
  it("overwrites a stored false, as Ruby ||= does", () => {
    const cable: Record<string, unknown> = { id: false };
    expect(new Base({ logger: null, config: { cable } }).identifier()).toBe(
      `ActionCable-PID-${Process.pid}`,
    );
  });
});
