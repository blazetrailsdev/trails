import { afterEach, describe, expect, it } from "vitest";
import { Base as ThorBase } from "@blazetrails/thor/shell";
import { Basic } from "@blazetrails/thor/shell/basic";
import { noColorBang } from "./behavior.js";

describe("Rails::Command::Behavior", () => {
  const original = ThorBase.shell ?? null;
  afterEach(() => {
    ThorBase.shell = original;
  });

  it("no_color! sets Thor::Base.shell to Thor::Shell::Basic", () => {
    noColorBang();
    expect(ThorBase.shell).toBe(Basic);
  });
});
