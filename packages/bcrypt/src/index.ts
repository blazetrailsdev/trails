import { TopLevel } from "@blazetrails/activesupport";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Error, Errors } from "./error.js";
import { Engine } from "./engine.js";
import { Password } from "./password.js";

export { Error, Errors, Engine, Password };

const BCrypt = { name: "BCrypt" } as {
  readonly name: string;
  Error: typeof Error;
  Errors: typeof Errors;
  Engine: typeof Engine;
  Password: typeof Password;
};
rbModConstSet(BCrypt, "Error", Error);
rbModConstSet(BCrypt, "Errors", Errors);
rbModConstSet(BCrypt, "Engine", Engine);
rbModConstSet(BCrypt, "Password", Password);
TopLevel.BCrypt = BCrypt;
