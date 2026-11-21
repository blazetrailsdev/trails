await cache(undefined, undefined, () => {
  xml.title("Hello!");
});

xml.body(cdataSection(await render("formatted_partial")));
