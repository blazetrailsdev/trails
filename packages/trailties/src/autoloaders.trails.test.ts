import { describe, expect, it } from "vitest";
import { Autoloaders } from "./autoloaders.js";
import { Inflector } from "./autoloaders/inflector.js";

describe("Rails::Autoloaders", () => {
  it("main and once are distinct loaders tagged rails.main and rails.once with the Rails inflector", () => {
    const autoloaders = new Autoloaders();
    expect(autoloaders.main.tag).toBe("rails.main");
    expect(autoloaders.once.tag).toBe("rails.once");
    expect(autoloaders.main.inflector).toBe(Inflector);
    expect(autoloaders.once.inflector).toBe(Inflector);
    expect(autoloaders.isZeitwerkEnabled()).toBe(true);
  });

  it("each yields main then once", () => {
    const autoloaders = new Autoloaders();
    const seen: unknown[] = [];
    autoloaders.each((loader) => seen.push(loader));
    expect(seen).toEqual([autoloaders.main, autoloaders.once]);
  });

  it("logger= reaches both loaders", () => {
    const autoloaders = new Autoloaders();
    const logger = (): void => {};
    autoloaders.logger = logger;
    expect(autoloaders.main.logger).toBe(logger);
    expect(autoloaders.once.logger).toBe(logger);
  });
});
