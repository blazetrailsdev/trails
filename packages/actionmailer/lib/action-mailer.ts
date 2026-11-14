import { Autoload } from "@blazetrails/activesupport";
import { Mail } from "@blazetrails/mail";
import { ActionMailer } from "./namespaces.js";

export async function eagerLoadBang(this: typeof ActionMailer): Promise<void> {
  await Autoload.eagerLoadBang.call(this);

  await Mail.eagerAutoloadBang();

  for (const mailer of this.Base.descendants) {
    if (!mailer.isAbstract()) mailer.eagerLoadBang();
  }
}

Object.defineProperty(ActionMailer, "eagerLoadBang", {
  value: eagerLoadBang,
  writable: true,
  configurable: true,
});
