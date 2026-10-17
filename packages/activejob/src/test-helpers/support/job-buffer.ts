import { rtest, last, Module, registerConstant } from "@blazetrails/ruby-compat";
import * as CodegenRuntime from "../../codegen-runtime.js";
import { rbAppend } from "../../codegen-runtime.js";
import { afterEach } from "vitest";

export function clear(): any {
  return CodegenRuntime.clear(JobBuffer.values());
}

export function add(value: any): any {
  return rbAppend(JobBuffer.values(), value);
}

export function values(): any {
  if (!rtest(JobBuffer._values)) JobBuffer._values = [];
  return JobBuffer._values;
}

export function lastValue(): any {
  return last(JobBuffer.values());
}

export const JobBuffer: any = new Module();
Object.assign(JobBuffer, { clear, add, values, lastValue });
registerConstant("JobBuffer", JobBuffer);
afterEach(async ({ testCase }: any) => {
  await clear();
});
