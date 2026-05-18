/**
 * ActionDispatch::Reloader
 *
 * Wraps the request with callbacks provided by ActiveSupport::Reloader, intended
 * to assist with code reloading during development. Included in the middleware
 * stack only if reloading is enabled (the default in `development` mode).
 */

import { Executor } from "./executor.js";

export class Reloader extends Executor {}
