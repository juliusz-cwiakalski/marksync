# Macro: Expand (Unsupported)

This fixture demonstrates a Confluence Expand macro, which is not authorable from Markdown in VERSION-TWO. When authored in Markdown, the macro tag is parsed as inline raw HTML and silently escaped at render (the macro appears as escaped literal text; no UnsupportedConstruct is raised).

<ac:structured-macro ac:name="expand">
  <ac:parameter ac:name="title">Click to expand</ac:parameter>
  <ac:rich-text-body>
    <p>This is the hidden content that appears when the user expands the macro.</p>
  </ac:rich-text-body>
</ac:structured-macro>

Regular content continues after the expand macro.