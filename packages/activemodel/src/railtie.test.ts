import { describe, it } from "vitest";

// Railtie tests cover Rails-specific initialization hooks.
// These are stubbed to match convention:compare since we don't have
// a Rails application context. The behavior they test (min_cost config,
// i18n_customize_full_message) would need a Railtie equivalent to
// implement properly.
describe("RailtieTest", () => {
  it.skip("secure password min_cost is false in the development environment", () => {});

  it.skip("secure password min_cost is true in the test environment", () => {});

  it.skip("i18n customize full message defaults to false", () => {});

  it.skip("i18n customize full message can be disabled", () => {});

  it.skip("i18n customize full message can be enabled", () => {});
});
