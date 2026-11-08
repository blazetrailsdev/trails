import { beforeEach, describe, expect, it, vi } from "vitest";
import { setEnv } from "@blazetrails/ruby-compat";
import { Application } from "./application.js";
import { useApplicationTestCase } from "./test-helpers/application.js";

describe("TestRakeTaskArgumentParsing", () => {
  useApplicationTestCase();
  let app: Application;

  beforeEach(() => {
    app = new Application();
  });

  it("name only", () => {
    const [name, args] = app.parseTaskString("name");
    expect(name).toBe("name");
    expect(args).toEqual([]);
  });

  it("empty args", () => {
    const [name, args] = app.parseTaskString("name[]");
    expect(name).toBe("name");
    expect(args).toEqual([]);
  });

  it("one argument", () => {
    const [name, args] = app.parseTaskString("name[one]");
    expect(name).toBe("name");
    expect(args).toEqual(["one"]);
  });

  it("two arguments", () => {
    const [name, args] = app.parseTaskString("name[one,two]");
    expect(name).toBe("name");
    expect(args).toEqual(["one", "two"]);
  });

  it("can handle spaces between args", () => {
    const [name, args] = app.parseTaskString("name[one, two,\tthree , \tfour]");
    expect(name).toBe("name");
    expect(args).toEqual(["one", "two", "three", "four"]);
  });

  it("can handle spaces between all args", () => {
    const [name, args] = app.parseTaskString("name[ one , two ,\tthree , \tfour ]");
    expect(name).toBe("name");
    expect(args).toEqual(["one", "two", "three", "four"]);
  });

  it("keeps embedded spaces", () => {
    const [name, args] = app.parseTaskString("name[a one ana, two]");
    expect(name).toBe("name");
    expect(args).toEqual(["a one ana", "two"]);
  });

  it("can handle commas in args", () => {
    const [name, args] = app.parseTaskString("name[one, two, three_a\\, three_b, four]");
    expect(name).toBe("name");
    expect(args).toEqual(["one", "two", "three_a, three_b", "four"]);
  });

  it("treat blank arg as empty string", () => {
    let [name, args] = app.parseTaskString("name[one,]");
    expect(name).toBe("name");
    expect(args).toEqual(["one", ""]);

    [name, args] = app.parseTaskString("name[one,,two]");
    expect(name).toBe("name");
    expect(args).toEqual(["one", "", "two"]);
  });

  it("terminal width using env", () => {
    app.terminalColumns = 1234;

    expect(app.terminalWidth()).toBe(1234);
  });

  it("terminal width using stty", () => {
    vi.spyOn(app, "isUnix").mockReturnValue(true);
    vi.spyOn(app, "dynamicWidthStty").mockReturnValue(1235);
    vi.spyOn(app, "dynamicWidthTput").mockReturnValue(0);

    expect(app.terminalWidth()).toBe(1235);
  });

  it("terminal width using tput", () => {
    vi.spyOn(app, "isUnix").mockReturnValue(true);
    vi.spyOn(app, "dynamicWidthStty").mockReturnValue(0);
    vi.spyOn(app, "dynamicWidthTput").mockReturnValue(1236);

    expect(app.terminalWidth()).toBe(1236);
  });

  it("terminal width using hardcoded 80", () => {
    vi.spyOn(app, "isUnix").mockReturnValue(false);

    expect(app.terminalWidth()).toBe(80);
  });

  it("terminal width with failure", () => {
    vi.spyOn(app, "isUnix").mockImplementation(() => {
      throw new Error();
    });

    expect(app.terminalWidth()).toBe(80);
  });

  it("no rakeopt", async () => {
    await app.init("rake", ["--trace"]);
    expect(!app.options.silent).toBeTruthy();
  });

  it("rakeopt with blank options", async () => {
    await app.init("rake", ["--trace"]);
    expect(!app.options.silent).toBeTruthy();
  });

  it("rakeopt with silent options", async () => {
    setEnv("RAKEOPT", "-s");

    await app.init("rake", []);

    expect(app.options.silent).toBeTruthy();
  });
});
