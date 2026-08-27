import { beforeAll, afterAll } from "vitest";
import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import { loadSchema } from "./load-schema-helper.js";
import {
  withTransactionalFixtures,
  type TransactionalFixturesAdapter,
} from "../test-fixtures/with-transactional-fixtures.js";

export interface AdapterSuiteOptions<A extends TransactionalFixturesAdapter> {
  factory: () => A | Promise<A>;
  setup?: (adapter: A) => Promise<void>;
  teardown?: (adapter: A) => Promise<void>;
  closeOnTeardown?: boolean;
}

export interface AdapterSuiteHandle<A extends TransactionalFixturesAdapter> {
  readonly adapter: A;
}

export function setupAdapterSuite<A extends TransactionalFixturesAdapter>(
  opts: AdapterSuiteOptions<A>,
): AdapterSuiteHandle<A> {
  let adapter: A | undefined;

  beforeAll(async () => {
    adapter = await opts.factory();
    await loadSchema(adapter as unknown as DatabaseAdapter);
    if (opts.setup) await opts.setup(adapter);
  });

  withTransactionalFixtures(() => {
    if (!adapter) {
      throw new Error(
        "setupAdapterSuite: adapter accessed before beforeAll completed — " +
          "check that `factory` did not throw",
      );
    }
    return adapter;
  });

  afterAll(async () => {
    if (!adapter) return;
    try {
      if (opts.teardown) await opts.teardown(adapter);
    } finally {
      if (opts.closeOnTeardown !== false) {
        const close = (adapter as unknown as { close?: () => Promise<void> }).close;
        if (typeof close === "function") await close.call(adapter);
      }
      adapter = undefined;
    }
  });

  return {
    get adapter(): A {
      if (!adapter) {
        throw new Error(
          "setupAdapterSuite: adapter not yet initialized — read it from " +
            "inside `it`/`beforeEach`, not at module load time",
        );
      }
      return adapter;
    },
  };
}
