const greeting = await render({ template: "test/greeting" });
xml.html(() => {
  xml.p(`Hello ${this.name}`);
  xml.append(greeting);
});
