# Raw HTML - Block Level (Unsupported)

This fixture demonstrates block-level raw HTML, which is flagged as `raw-html-block` and not allowed.

<div class="custom-block">
  <h2>Custom Heading</h2>
  <p>This is a custom div block with inline styles.</p>
</div>

<div id="special-container" data-value="test">
  <p>Content in a special container.</p>
</div>

## Regular Markdown

Regular markdown content between HTML blocks.

<aside class="note">
  <p>This is an aside element.</p>
</aside>

Block-level raw HTML is not supported and will be flagged.