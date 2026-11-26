import { describe, it, expect } from "vitest";
import { constSet } from "@blazetrails/ruby-compat";
import { CurrentAttributes } from "../lib/current-attributes.js";

describe("CurrentAttributes (trails)", () => {
  class Current extends CurrentAttributes {
    static {
      this.attribute("world");
    }
  }

  it("protocol probes on the class are not forwarded to the instance", async () => {
    expect((CurrentAttributes as unknown as { then?: unknown }).then).toBeUndefined();
    expect((Current as unknown as { then?: unknown }).then).toBeUndefined();
    expect(await Current).toBe(Current);
    expect(Current).toBe(Current);
  });

  it("keys a class's instance by its full name, so two Currents in different namespaces stay apart", () => {
    const Storage = {};
    const App = {};
    const storage = class Current extends CurrentAttributes {
      static {
        this.attribute("urlOptions");
      }
    };
    const app = class Current extends CurrentAttributes {
      static {
        this.attribute("user");
      }
    };
    constSet(Storage, "Current", storage);
    constSet(App, "Current", app);

    expect(app.instance()).toBeInstanceOf(app);
    expect(storage.instance()).toBeInstanceOf(storage);
  });

  it("raises on an anonymous class, as name.to_sym does on nil", () => {
    const anonymous = [class extends CurrentAttributes {}][0];
    expect(() => anonymous.instance()).toThrow("undefined method 'to_sym' for nil");
  });
});
