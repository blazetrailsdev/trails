import { Module } from "@blazetrails/ruby-compat";

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
  const ret = await BasicImplicitRender.superMethod(this, "sendAction")!(method, ...args);
  if (!this.performed) await this.defaultRender();
  return ret;
}

export function defaultRender(this: BasicImplicitRenderHost): void {
  this.head("no_content");
}

export const BasicImplicitRender = new Module((mod) => {
  mod.moduleEval((m) => {
    Object.assign(m, { sendAction, defaultRender });
  });
});
