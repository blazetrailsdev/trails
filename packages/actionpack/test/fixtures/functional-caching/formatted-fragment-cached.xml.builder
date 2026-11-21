await xml.body(async () => {
  await cache("fragment", undefined, () => {
    xml.p("Builder");
  });
});
