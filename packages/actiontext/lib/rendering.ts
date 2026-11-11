import { ActionController } from "@blazetrails/actionpack";
import {
  Concern,
  delegate,
  extend,
  IsolatedExecutionState,
  threadCattrAccessor,
  threadMattrKey,
  type Extended,
} from "@blazetrails/activesupport";
import { rbEnsure } from "@blazetrails/ruby-compat";
import { ActionText } from "./action-text.js";

interface RendererLike {
  renderToString(...args: unknown[]): unknown;
}

interface RenderingClass {
  renderer: RendererLike | null;
  _actionControllerRenderer?: RendererLike;
  actionControllerRenderer(): RendererLike;
}

export const Rendering = {} as Extended<typeof Concern>;
extend(Rendering, Concern);

(Rendering as unknown as { included(base: null, block: (this: object) => void): void }).included(
  null,
  function (this: object) {
    threadCattrAccessor.call(this, "renderer", { instanceAccessor: false });
    delegate.call((this as { prototype: object }).prototype, "render", { to: "class" });
  },
);

Rendering.classMethods((mod) => {
  mod.actionControllerRenderer = function (this: RenderingClass): RendererLike {
    return (this._actionControllerRenderer ??= class extends ActionController.Base {}.renderer);
  };

  /** @inventedArm fork — PERMANENT */
  mod.withRenderer = function <T>(
    this: RenderingClass,
    renderer: RendererLike | null,
    block: () => T,
  ): T {
    return IsolatedExecutionState.fork(threadMattrKey(this, "renderer"), () => {
      const previousRenderer = this.renderer;
      return rbEnsure(
        () => {
          this.renderer = renderer;
          return block();
        },
        () => {
          this.renderer = previousRenderer;
        },
      );
    });
  };

  mod.render = function (this: RenderingClass, ...args: unknown[]): unknown {
    return (this.renderer ?? this.actionControllerRenderer()).renderToString(...args);
  };
});

export interface RenderingClassMethods {
  renderer: RendererLike | null;
  actionControllerRenderer(): RendererLike;
  withRenderer<T>(renderer: RendererLike | null, block: () => T): T;
  render(...args: unknown[]): unknown;
}

ActionText.Rendering = Rendering;
