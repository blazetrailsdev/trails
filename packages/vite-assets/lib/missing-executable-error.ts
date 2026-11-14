import { Error } from "./error.js";

export class MissingExecutableError extends Error {
  constructor(error: unknown = null) {
    super(`❌ The vite binary is not available. Have you installed the npm packages?

:troubleshooting:
${error ?? ""}
`);
  }
}
