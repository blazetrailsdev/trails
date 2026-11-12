import { describe } from "vitest";
import { isSqliteRun } from "./sqlite-template.js";

export const describeIfSqlite = isSqliteRun() ? describe : (describe.skip as typeof describe);
