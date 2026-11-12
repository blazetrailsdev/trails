import { describe } from "vitest";
import { adapterType } from "../../lib/test-adapter.js";

export const describeIfMysqlAdapter =
  adapterType === "mysql" ? describe : (describe.skip as typeof describe);
