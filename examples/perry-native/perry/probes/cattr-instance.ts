import { ActionDispatch } from "@blazetrails/actionpack";

const ExceptionWrapper = ActionDispatch.ExceptionWrapper;
const w = new ExceptionWrapper(null, new Error("boom"));
const statik = (ExceptionWrapper as unknown as { wrapperExceptions: unknown }).wrapperExceptions;
const inst = (w as unknown as { wrapperExceptions: unknown }).wrapperExceptions;
console.log(`C1 static  : ${JSON.stringify(statik)}`);
console.log(`C2 instance: ${JSON.stringify(inst)}`);
console.log(
  `C3 silent  : ${JSON.stringify((w as unknown as { silentExceptions: unknown }).silentExceptions)}`,
);
