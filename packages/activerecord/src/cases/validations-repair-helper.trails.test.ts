import { describe, it, expect } from "vitest";
import { Base } from "../index.js";
import { withTransactionalFixtures } from "../test-fixtures/with-transactional-fixtures.js";
import { repairValidations } from "./validations-repair-helper.js";
import { leaseFixtureConnection } from "../test-fixtures/fixture-connection.js";

withTransactionalFixtures(leaseFixtureConnection);

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
