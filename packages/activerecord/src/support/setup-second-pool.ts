import { beforeAll } from "vitest";
import { Base } from "../base.js";
import type { AbstractAdapter as DatabaseAdapter } from "../connection-adapters/abstract-adapter.js";
import { registerModel } from "../associations.js";
import { loadCanonicalArunit2Schema } from "./canonical-schema.js";
import { ARUnit2Model } from "../test-helpers/models/arunit2-model.js";
import { Course } from "../test-helpers/models/course.js";
import { College } from "../test-helpers/models/college.js";
import { Entrant } from "../test-helpers/models/entrant.js";
import { Professor } from "../test-helpers/models/professor.js";
import { activeLane } from "./connection.js";
import { canonicalSchemaUpToDate, stampCanonicalSchema } from "./canonical-schema-stamp.js";

/** @internal */
export const ARUNIT2_TABLES = ["colleges", "courses", "professors", "courses_professors"] as const;

async function createOtherDogsTable(adapter: DatabaseAdapter): Promise<void> {
  await adapter.createTable("dogs", { force: true }, () => {});
}

export async function provisionSecondDatabase(): Promise<void> {
  if (activeLane() !== "sqlite") {
    const database = String(ARUnit2Model.connectionDbConfig().database);
    const primary = (await Base.leaseConnection()) as unknown as {
      createDatabase(name: string): Promise<void>;
    };
    await primary.createDatabase(database).catch(() => undefined);
  }
  const arunit2 = await ARUnit2Model.leaseConnection();
  const wanted = [...ARUNIT2_TABLES, "dogs"];
  const present = new Set(await arunit2.tables());
  if ((await canonicalSchemaUpToDate(arunit2)) && wanted.every((name) => present.has(name))) {
    await arunit2.truncateTables(...wanted);
    return;
  }
  await loadCanonicalArunit2Schema(arunit2);
  await createOtherDogsTable(arunit2);
  await stampCanonicalSchema(arunit2);
}

async function setupSecondPool(): Promise<void> {
  registerModel(College);
  registerModel(Course);
  registerModel(Entrant);
  registerModel(Professor);
  const arunit2 = await ARUnit2Model.leaseConnection();

  await arunit2.truncateTables(...ARUNIT2_TABLES);
}

export function withSecondPool(): void {
  beforeAll(setupSecondPool);
}
