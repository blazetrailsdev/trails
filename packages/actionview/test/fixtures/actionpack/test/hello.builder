await xml.html(async () => {
  xml.p(`Hello ${this.name ?? ""}`);
  xml.append(await render({ template: "test/greeting" }));
});
