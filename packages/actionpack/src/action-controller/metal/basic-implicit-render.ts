import { ActionController } from "../../namespaces.js";
import { rbCallSuper } from "@blazetrails/ruby-compat";

/** @internal */
export interface BasicImplicitRenderHost {
  performed: boolean;
  head(status: number | string): void;
  defaultRender(): void | Promise<void>;
}

export async function sendAction(
  this: BasicImplicitRenderHost,
  method: string,
  ...args: unknown[]
): Promise<unknown> {
  const ret = await rbCallSuper(this, sendAction, method, ...args);
  if (!this.performed) await this.defaultRender();
  return ret;
}

export function defaultRender(this: BasicImplicitRenderHost): void {
  this.head("no_content");
}

export const BasicImplicitRender = { sendAction, defaultRender };

ActionController.BasicImplicitRender = BasicImplicitRender;
