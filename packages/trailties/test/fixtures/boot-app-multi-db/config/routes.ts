import { Trails } from "../../../../lib/trails.js";

Trails.application!.routes().draw(function () {
  this.post("/posts", { to: "posts#create" });
  this.post("/posts/preview", { to: "posts#preview" });
  this.post("/dogs", { to: "dogs#create" });
});
