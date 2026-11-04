import { NameError as RubyNameError, StandardError, rbModName } from "@blazetrails/ruby-compat";
import "./zeitwerk.js";
import { describe, expect, it } from "vitest";
import {
  Error as ZeitwerkError,
  NameError,
  ReloadingDisabledError,
  SetupRequired,
} from "./error.js";

describe("Zeitwerk errors", () => {
  it("carries Zeitwerk's messages", () => {
    expect(new ReloadingDisabledError().message).toBe(
      "can't reload, please call loader.enable_reloading before setup",
    );
    expect(new SetupRequired().message).toBe(
      "please, finish your configuration and call Zeitwerk::Loader#setup once all is ready",
    );
  });

  it("registers Zeitwerk's class paths through the package entry", () => {
    expect(rbModName(NameError)).toBe("Zeitwerk::NameError");
  });

  it("keeps Zeitwerk's ancestry", () => {
    expect(new ZeitwerkError()).toBeInstanceOf(StandardError);
    expect(new SetupRequired()).toBeInstanceOf(ZeitwerkError);
    expect(new ReloadingDisabledError()).toBeInstanceOf(ZeitwerkError);
    expect(new NameError()).toBeInstanceOf(RubyNameError);
  });
});
