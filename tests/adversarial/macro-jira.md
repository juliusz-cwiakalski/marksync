# Macro: Jira Issue (Unsupported)

This fixture demonstrates a Confluence Jira macro, which is not authorable from Markdown in VERSION-TWO. When authored in Markdown, the macro tag is parsed as inline raw HTML and silently escaped at render (the macro appears as escaped literal text; no UnsupportedConstruct is raised).

<ac:structured-macro ac:name="jira">
  <ac:parameter ac:name="key">PROJ-123</ac:parameter>
  <ac:parameter ac:name="server">Default Jira</ac:parameter>
</ac:structured-macro>

This Jira issue macro would display issue details from the Jira integration.