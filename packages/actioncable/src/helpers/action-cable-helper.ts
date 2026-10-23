import { RuntimeError, defineModule } from "@blazetrails/ruby-compat";
import { ActionCable } from "../namespaces.js";
import type { Base as Server } from "../server/base.js";

interface ActionCableHelperHost {
  tag(name: string, options?: Record<string, unknown> | null): unknown;
}

function actionCableMetaTag(this: ActionCableHelperHost): unknown {
  const config = (ActionCable.server() as Server).config;
  let content = config.url;
  if (content == null || content === false) content = config.mountPath;
  if (content == null || content === false)
    throw new RuntimeError(
      "No Action Cable URL configured -- please configure this at config.action_cable.url",
    );
  return this.tag("meta", { name: "action-cable-url", content });
}

export const ActionCableHelper = defineModule({ actionCableMetaTag });
