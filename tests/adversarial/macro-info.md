# Macro: Info (Unsupported)

This fixture demonstrates a Confluence Info macro, which is not authorable from Markdown in VERSION-TWO. When authored in Markdown, the macro tag is parsed as inline raw HTML and silently escaped at render (the macro appears as escaped literal text; no UnsupportedConstruct is raised).

<ac:structured-macro ac:name="info">
  <ac:parameter ac:name="icon">true</ac:parameter>
  <ac:rich-text-body>
    <p><strong>Important note:</strong> This is an informational message.</p>
  </ac:rich-text-body>
</ac:structured-macro>

Regular content follows the info macro.