import { expect } from "vitest";
import { matchers, rubyEquality } from "./index.js";

expect.extend(matchers);
expect.addEqualityTesters([rubyEquality]);
