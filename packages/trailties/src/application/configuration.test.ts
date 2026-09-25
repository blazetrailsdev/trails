import { afterEach, describe, expect, it } from "vitest";
import { env, setEnv } from "@blazetrails/ruby-compat";
import { Trails, _resetTrailsEnv } from "../rails.js";

function switchEnv(key: string, value: string | undefined, block: () => void): void {
  const old = env[key];
  setEnv(key, value);
  try {
    block();
  } finally {
    setEnv(key, old);
  }
}

function withRailsEnv(railsEnv: string | undefined, block: () => void): void {
  _resetTrailsEnv();
  switchEnv("TRAILS_ENV", railsEnv, () => switchEnv("NODE_ENV", undefined, block));
}

function withRackEnv(rackEnv: string | undefined, block: () => void): void {
  _resetTrailsEnv();
  switchEnv("NODE_ENV", rackEnv, () => switchEnv("TRAILS_ENV", undefined, block));
}

describe("ConfigurationTest", () => {
  afterEach(() => {
    _resetTrailsEnv();
  });

  it("Rails.env falls back to development if RAILS_ENV is blank and RACK_ENV is nil", () => {
    withRailsEnv("", () => {
      expect(Trails.env.toString()).toBe("development");
    });
  });

  it("Rails.env falls back to development if RACK_ENV is blank and RAILS_ENV is nil", () => {
    withRackEnv("", () => {
      expect(Trails.env.toString()).toBe("development");
    });
  });
});
