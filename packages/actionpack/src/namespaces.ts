import { Autoload, extend, type Extended } from "@blazetrails/activesupport";
import type { Request } from "./action-dispatch/http/request.js";

type AutoloadModule = Autoload.Autoload & Extended<typeof Autoload>;

const loadPath: Record<string, () => Promise<unknown>> = {
  "action_dispatch/http/request": () => import("./action-dispatch/http/request.js"),
};

export const ActionDispatch = { name: "ActionDispatch", loadPath } as AutoloadModule & {
  Request: typeof Request;
};
extend(ActionDispatch, Autoload);
ActionDispatch.eagerAutoload(() => {
  ActionDispatch.autoloadUnder("http", () => {
    ActionDispatch.autoload("Request");
  });
});
