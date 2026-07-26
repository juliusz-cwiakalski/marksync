# App Content: Gliffy Diagram (Unsupported)

This fixture demonstrates a Confluence Gliffy diagram, which is not authorable from Markdown in VERSION-TWO. When authored in Markdown, the macro tag is parsed as inline raw HTML and silently escaped at render (the macro appears as escaped literal text; no UnsupportedConstruct is raised).

<ac:structured-macro ac:name="gliffy">
  <ac:parameter ac:name="key">abc123</ac:parameter>
  <ac:parameter ac:name="version">2</ac:parameter>
  <ac:parameter ac:name="width">800</ac:parameter>
  <ac:parameter ac:name="height">600</ac:parameter>
</ac:structured-macro>

The Gliffy diagram above would be rendered by Confluence's diagram integration.