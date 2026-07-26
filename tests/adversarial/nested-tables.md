# Nested Tables (Unsupported)

This fixture demonstrates nested tables using raw HTML blocks. GFM tables are flat and cannot be nested directly in Markdown.

<table>
  <tr>
    <th>Outer Header</th>
    <td>
      <table>
        <tr><th>Inner Header</th></tr>
        <tr><td>Inner Cell</td></tr>
      </table>
    </td>
  </tr>
</table>