import { describe, it, expect, beforeAll } from "vitest";
import { Base } from "../index.js";
import { defineSchema } from "./define-schema.js";
import { setupHandlerSuite } from "./setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./use-handler-transactional-fixtures.js";
import { repairValidations } from "./repair-validations.js";

setupHandlerSuite();
useHandlerTransactionalFixtures();
beforeAll(async () => {
  await defineSchema({
    interests: { topic: "string", zine_id: "integer" },
    zines: { title: "string" },
  });
});

describe("repairValidations", () => {
  it("removes a validator added inside the block after it returns", async () => {
    class Interest extends Base {
      static {
        this.attribute("topic", "string");
        this.attribute("zine_id", "integer");
      }
    }

    await repairValidations(Interest, () => {
      Interest.validates("topic", { presence: true });
    });

    // The validator made a blank topic invalid inside the block; once the
    // block returns clear_validators! has run, so a blank topic is valid
    // again — the validator did not leak.
    const after = new Interest({});
    expect(await after.isValid()).toBe(true);
    expect(Interest.validators()).toHaveLength(0);
  });

  it("applies the validator while the block runs", async () => {
    class Interest extends Base {
      static {
        this.attribute("topic", "string");
        this.attribute("zine_id", "integer");
      }
    }

    await repairValidations(Interest, async () => {
      Interest.validates("topic", { presence: true });
      const blank = new Interest({});
      expect(await blank.isValid()).toBe(false);
    });
  });

  it("clears validators for every model passed", async () => {
    class Interest extends Base {
      static {
        this.attribute("topic", "string");
      }
    }
    class Zine extends Base {
      static {
        this.attribute("title", "string");
      }
    }

    await repairValidations([Interest, Zine], () => {
      Interest.validates("topic", { presence: true });
      Zine.validates("title", { presence: true });
    });

    expect(Interest.validators()).toHaveLength(0);
    expect(Zine.validators()).toHaveLength(0);
    expect(await new Interest({}).isValid()).toBe(true);
    expect(await new Zine({}).isValid()).toBe(true);
  });

  it("clears validators even when the block throws", async () => {
    class Interest extends Base {
      static {
        this.attribute("topic", "string");
        this.attribute("zine_id", "integer");
      }
    }

    await expect(
      repairValidations(Interest, () => {
        Interest.validates("topic", { presence: true });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const after = new Interest({});
    expect(await after.isValid()).toBe(true);
    expect(Interest.validators()).toHaveLength(0);
  });
});
