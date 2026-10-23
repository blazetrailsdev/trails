import { RuntimeError, include } from "@blazetrails/ruby-compat";
import { afterEach, describe, expect, it } from "vitest";
import "../index.js";
import { ActionCable } from "../namespaces.js";
import type { Base as Server } from "../server/base.js";
import { ActionCableHelper } from "./action-cable-helper.js";

class View {
  tag(name: string, options: Record<string, unknown> | null = null): string {
    const attrs = Object.entries(options ?? {})
      .map(([k, v]) => ` ${k}="${v}"`)
      .join("");
    return `<${name}${attrs} />`;
  }
}
include(View, ActionCableHelper);
const view = new View() as View & { actionCableMetaTag(): string };

const config = (ActionCable.server() as Server).config;

describe("ActionCable::Helpers::ActionCableHelper#action_cable_meta_tag", () => {
  afterEach(() => {
    config.url = config.mountPath = undefined;
  });

  it("renders the configured url", () => {
    config.url = "wss://example.com/cable";
    config.mountPath = "/cable";
    expect(view.actionCableMetaTag()).toBe(
      '<meta name="action-cable-url" content="wss://example.com/cable" />',
    );
  });

  it("uses an empty url as is", () => {
    config.url = "";
    config.mountPath = "/cable";
    expect(view.actionCableMetaTag()).toBe('<meta name="action-cable-url" content="" />');
  });

  it("falls back to the mount path", () => {
    config.mountPath = "/cable";
    expect(view.actionCableMetaTag()).toBe('<meta name="action-cable-url" content="/cable" />');
  });

  it("raises when neither is configured", () => {
    expect(() => view.actionCableMetaTag()).toThrow(RuntimeError);
    expect(() => view.actionCableMetaTag()).toThrow(
      "No Action Cable URL configured -- please configure this at config.action_cable.url",
    );
  });
});
