import { afterEach, describe, expect, it } from "vitest";

import { Listen, Listener } from "../lib/listen.js";

describe("Listen", () => {
  afterEach(async () => {
    await Listen.stop();
  });

  describe(".to", () => {
    it("initalizes listener", () => {
      expect(Listen.to("/path")).toBeInstanceOf(Listener);
    });
  });

  describe(".stop", () => {
    it("stops all listeners", async () => {
      const listener = Listen.to("/path");
      await Listen.stop();
      expect(listener.isStopped()).toBe(true);
    });
  });
});
