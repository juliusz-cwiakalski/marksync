# Raw HTML - Inline (Escaped, Not Flagged)

This fixture demonstrates inline raw HTML, which is escaped during rendering and not flagged as unsupported.

## Inline HTML Examples

This paragraph has **bold** text with <b>inline HTML bold</b> mixed together.

You can also use <em>inline HTML italic</em> alongside *regular italic* text.

Here's a <span class="highlight">highlighted span</span> using inline HTML.

## Escaping Behavior

Inline HTML tags are escaped by the Markdown renderer:
- `<b>` becomes `&lt;b&gt;`
- `<em>` becomes `&lt;em&gt;`
- `<span>` becomes `&lt;span&gt;`

## Examples

Click <a href="https://example.com">here</a> for more information.

Use <code>inline code</code> and <tt>teletype text</tt> as needed.

Inline raw HTML is escaped, not flagged, per DEC-4.