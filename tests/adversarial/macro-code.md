# Macro: Code (Unsupported)

This fixture demonstrates a Confluence Code macro with parameters, which is not authorable from Markdown in VERSION-TWO. When authored in Markdown, the macro tag is parsed as inline raw HTML and silently escaped at render (the macro appears as escaped literal text; no UnsupportedConstruct is raised).

<ac:structured-macro ac:name="code">
  <ac:parameter ac:name="language">javascript</ac:parameter>
  <ac:parameter ac:name="title">Example.js</ac:parameter>
  <ac:parameter ac:name="linenumbers">true</ac:parameter>
  <ac:plain-text-body><![CDATA[
function example() {
  console.log("Hello, world!");
  return true;
}
]]></ac:plain-text-body>
</ac:structured-macro>

The code macro above would normally be rendered by Confluence.