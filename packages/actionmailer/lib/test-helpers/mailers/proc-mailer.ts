import { ActionView } from "@blazetrails/actionpack";
import { Time } from "@blazetrails/date";
import { Base } from "../../base.js";

export class ProcMailer extends Base {
  static {
    this.prependViewPath(new ActionView.FixtureResolver({ "proc-mailer/welcome.html.tse": "" }));

    this.default({
      to: "system@test.lindsaar.net",
      "X-Proc-Method": () => String(Time.now().toI()),
      subject: function (this: ProcMailer) {
        return this.giveAGreeting();
      },
      "x-has-to-proc": "symbol",
      "X-Lambda-Arity-0": () => "0",
      "X-Lambda-Arity-1-arg": (arg: ProcMailer) => arg.computedValue(),
      "X-Lambda-Arity-1-self": function (this: ProcMailer, _: unknown) {
        return this.computedValue();
      },
    });
  }

  welcome() {
    return this.mail();
  }

  computedValue() {
    return "complex_value";
  }

  /** @internal */
  private giveAGreeting() {
    return "Thanks for signing up this afternoon";
  }
}
