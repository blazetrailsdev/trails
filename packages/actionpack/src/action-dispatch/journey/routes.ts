import { Or, Node } from "./nodes/node.js";
import { Builder } from "./gtg/builder.js";
import { Simulator } from "./gtg/simulator.js";
import type { Route } from "./route.js";

/**
 * Journey::Mapping shape — Rails calls `mapping.make_route(name, index)`
 * to construct a Route. Trails consumers can implement this interface
 * directly or hand `Routes.addRoute` a factory.
 */
export interface Mapping {
  makeRoute(name: string, index: number): Route;
}

/**
 * The routing table. Contains all routes for a system. Routes can be
 * added by calling `Routes#addRoute`.
 */
export class Routes implements Iterable<Route> {
  readonly routes: Route[];
  readonly customRoutes: Route[] = [];
  readonly anchoredRoutes: Route[] = [];

  /** @internal */
  private _ast: Node | null = null;
  /** @internal */
  private _simulator: Simulator | null = null;

  constructor(routes: Route[] = []) {
    this.routes = routes;
  }

  isEmpty(): boolean {
    return this.routes.length === 0;
  }

  get length(): number {
    return this.routes.length;
  }

  /** Rails alias :size :length */
  get size(): number {
    return this.length;
  }

  get last(): Route | undefined {
    return this.routes[this.routes.length - 1];
  }

  [Symbol.iterator](): Iterator<Route> {
    return this.routes[Symbol.iterator]();
  }

  /** Rails `routes.each(&block)`. */
  each(block: (route: Route) => void): void {
    for (const r of this.routes) block(r);
  }

  clear(): void {
    this.routes.length = 0;
    this.anchoredRoutes.length = 0;
    this.customRoutes.length = 0;
    this.clearCacheBang();
  }

  partitionRoute(route: Route): void {
    if (route.path.anchored && route.path.isRequirementsAnchored()) {
      this.anchoredRoutes.push(route);
    } else {
      this.customRoutes.push(route);
    }
  }

  get ast(): Node {
    if (this._ast) return this._ast;
    const nodes = this.anchoredRoutes.map((r) => r.path.ast?.tree ?? r.ast);
    this._ast = new Or(nodes);
    return this._ast;
  }

  get simulator(): Simulator {
    if (this._simulator) return this._simulator;
    const gtg = new Builder(this.ast).transitionTable();
    this._simulator = new Simulator(gtg);
    return this._simulator;
  }

  addRoute(name: string, mapping: Mapping): Route {
    const route = mapping.makeRoute(name, this.routes.length);
    this.routes.push(route);
    this.partitionRoute(route);
    this.clearCacheBang();
    return route;
  }

  /** @internal */
  private clearCacheBang(): void {
    this._ast = null;
    this._simulator = null;
  }
}
