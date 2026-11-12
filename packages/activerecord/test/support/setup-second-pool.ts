import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { beforeAll } from "vitest";
import { Base } from "../../lib/base.js";
import type { AbstractAdapter as DatabaseAdapter } from "../../lib/connection-adapters/abstract-adapter.js";
import { loadCanonicalArunit2Schema } from "./canonical-schema.js";
import { ARUnit2Model } from "../models/arunit2-model.js";
import { Course } from "../models/course.js";
import { College } from "../models/college.js";
import { Entrant } from "../models/entrant.js";
import { Professor } from "../models/professor.js";
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
  constSet(TopLevel, "College", College);
  constSet(TopLevel, "Course", Course);
  constSet(TopLevel, "Entrant", Entrant);
  constSet(TopLevel, "Professor", Professor);
  const arunit2 = await ARUnit2Model.leaseConnection();

  await arunit2.truncateTables(...ARUNIT2_TABLES);
}

export function withSecondPool(): void {
  beforeAll(setupSecondPool);
}
