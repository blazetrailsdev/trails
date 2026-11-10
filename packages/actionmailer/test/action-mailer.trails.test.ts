import { describe, expect, it } from "vitest";
import { registerSubclass } from "@blazetrails/activesupport";
import { ActionMailer } from "../lib/namespaces.js";
import "../lib/action-mailer.js";
import { Base } from "../lib/base.js";

describe("ActionMailer.eagerLoadBang", () => {
  it("eager loads every non-abstract Base descendant", async () => {
    const loaded: string[] = [];
    class AbstractMailer extends Base {
      static override eagerLoadBang(): void {
        loaded.push("abstract");
      }
    }
    AbstractMailer.abstractBang();
    class ConcreteMailer extends AbstractMailer {
      static override eagerLoadBang(): void {
        loaded.push("concrete");
      }
    }
    registerSubclass(Base, AbstractMailer);
    registerSubclass(AbstractMailer, ConcreteMailer);

    await (ActionMailer as unknown as { eagerLoadBang(): Promise<void> }).eagerLoadBang();

    expect(loaded).toEqual(["concrete"]);
  });
});
