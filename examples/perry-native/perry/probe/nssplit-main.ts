import * as routing from "./nssplit/routing.js";
console.log(`nested   = ${routing.WithIntegrationRouting.ClassMethods.withRouting()}`);
console.log(`toplevel = ${routing.ClassMethods.withRouting()}`);
console.log(`bare     = ${routing.withRouting()}`);
