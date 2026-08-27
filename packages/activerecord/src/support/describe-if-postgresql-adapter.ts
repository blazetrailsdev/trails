import { describe } from "vitest";
import { adapterType } from "../test-adapter.js";

export const describeIfPostgresqlAdapter =
  adapterType === "postgres" ? describe : (describe.skip as typeof describe);
