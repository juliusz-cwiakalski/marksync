# Macro: TOC (Unsupported)

This fixture demonstrates a Confluence Table of Contents macro, which is not authorable from Markdown in VERSION-TWO. When authored in Markdown, the macro tag is parsed as inline raw HTML and silently escaped at render (the macro appears as escaped literal text; no UnsupportedConstruct is raised).

<ac:structured-macro ac:name="toc">
  <ac:parameter ac:name="maxLevel">3</ac:parameter>
  <ac:parameter ac:name="outline">true</ac:parameter>
  <ac:parameter ac:name="indent">true</ac:parameter>
</ac:structured-macro>

## Section One

Content for section one.

### Subsection 1.1

Content for subsection.

## Section Two

Content for section two.