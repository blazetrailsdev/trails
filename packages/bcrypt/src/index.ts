import { TopLevel } from "@blazetrails/activesupport";
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
BCrypt.Error = Error;
BCrypt.Errors = Errors;
BCrypt.Engine = Engine;
BCrypt.Password = Password;
TopLevel.BCrypt = BCrypt;

import "./class-paths.generated.js";
