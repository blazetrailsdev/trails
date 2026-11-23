import { afterEach, describe, expect, it, vi } from "vitest";

import { Listen, Listener } from "../lib/listen.js";

describe("Listen", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await Listen.stop();
  });

  describe(".to", () => {
    it("initalizes listener", () => {
      const listener = new Listener("/path");
      const listenerNew = vi.spyOn(Listen, "Listener").mockImplementation(function () {
        return listener;
      });
      Listen.to("/path");
      expect(listenerNew).toHaveBeenCalledWith("/path");
    });
  });

  describe(".stop", () => {
    it("stops all listeners", async () => {
      const listener = Listen.to("/path");
      const stop = vi.spyOn(listener, "stop");
      await Listen.stop();
      expect(stop).toHaveBeenCalled();
    });
  });
});
