import { defineFixtures } from "./define-fixtures.js";
import type { DatabaseAdapter } from "../adapter.js";
import type { Base } from "../base.js";

type BaseClass = typeof Base;
type FixtureAttrs = Record<string, unknown>;

/**
 * Static wrapper around `defineFixtures` that mirrors the Rails
 * `ActiveRecord::FixtureSet` class surface.
 */
export class FixtureSet {
  static async createFixtures<T extends BaseClass, K extends string>(
    adapter: DatabaseAdapter,
    ModelClass: T,
    fixtures: Record<K, FixtureAttrs>,
  ): Promise<{ [P in K]: InstanceType<T> }> {
    return defineFixtures(adapter, ModelClass, fixtures);
  }
}
