import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";

export type TransactionalFixturesAdapter = DatabaseAdapter;

export interface WithTransactionalFixturesOptions {
  usesTransaction?: string[];

  useTransactionalTests?: boolean;
}
