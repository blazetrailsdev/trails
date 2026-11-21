await xml.body(async () => {
  await cache("fragment", {}, () => {
    xml.p("Builder");
  });
});
