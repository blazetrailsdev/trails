import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { ApplicationController } from "./application-controller.js";

type Host = Record<string, (...args: unknown[]) => unknown>;

export class TraysController extends ApplicationController {
  show(): void {}

  create(): unknown {
    const self = this as unknown as Host;
    const trayUrl = (id: number) => self["trayUrl"]({ id }) as string;
    switch (this.params.get("return_to")) {
      case "recede_or_redirect":
        return self["recedeOrRedirectTo"](trayUrl(1));
      case "resume_or_redirect":
        return self["resumeOrRedirectTo"](trayUrl(1));
      case "refresh_or_redirect":
        return self["refreshOrRedirectTo"](trayUrl(1));
      case "recede_or_redirect_back":
        return self["recedeOrRedirectBackOrTo"](trayUrl(5));
      case "resume_or_redirect_back":
        return self["resumeOrRedirectBackOrTo"](trayUrl(5));
      case "refresh_or_redirect_back":
        return self["refreshOrRedirectBackOrTo"](trayUrl(5));
      case "refresh_or_redirect_with_options":
        return self["refreshOrRedirectTo"](trayUrl(5), {
          notice: "confirmed",
          nativeParams: { custom: 123 },
        });
      default:
        throw new Error("Supply return_to to direct response");
    }
  }
}
constSet(TopLevel, "TraysController", TraysController);
