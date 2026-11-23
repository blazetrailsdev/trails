import { h } from "vue";
import DefaultTheme from "vitepress/theme";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/jetbrains-mono";
import GuideFooter from "./GuideFooter.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      "nav-bar-title-before": () => [
        h("span", { class: "bt-wm", "aria-hidden": "true" }, [
          h("span", { class: "blaze" }, "blaze"),
          h("span", { class: "trails" }, "trails"),
        ]),
        h("span", { class: "visually-hidden" }, "BlazeTrails"),
      ],
      "doc-after": () => h(GuideFooter),
    });
  },
};
