# Markdown Kitchen-Sink

A full GFM construct coverage test for the MarkSync storage round-trip.

## Headings

# H1
## H2
### H3
#### H4
##### H5
###### H6

## Inline formatting

**bold**, *italic*, **bold *and italic***, ~~strike~~, `inline code`.

## Links

A [link](https://opencode.ai) and a [query link](https://example.com/page?q=1&r=2).

## Images

Remote: ![alt text](https://example.com/diagram.png)
Attachment: ![diagram](diagram.png)

## Unordered list

- alpha
- beta

## Ordered list, nested

1. one
2. two
   - nested a
   - nested b

## Task list

- [ ] todo item
- [x] done item

## Blockquote

> A quoted paragraph.

## Fenced code block

```python
def hello(name):
    print(f"hello, {name}")
hello("world")
```

## Horizontal rule

---

## GFM table

| Feature | Status |
| - | - |
| Tables | ok |
| `code` cell | **bold** cell |
