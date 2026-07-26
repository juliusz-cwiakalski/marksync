# Mixed Task and Regular Lists (Supported)

This fixture demonstrates interleaved task lists and regular lists, which should render correctly in the Storage format.

## Regular Unordered List

- First item
- Second item
- Third item

## Task List (Checkbox Style)

- [ ] Task one - not completed
- [ ] Task two - not completed
- [x] Task three - completed
- [x] Task four - completed
- [ ] Task five - not completed

## Interleaved Lists

This section demonstrates mixing regular and task items:

- Regular item 1
- [ ] Task item A
- Regular item 2
- [x] Task item B (completed)
- Regular item 3

## Nested Lists

Outer items:
- Item A
  - [ ] Nested task 1
  - Item A.1
- Item B
  - [x] Nested task 2 (completed)
  - Item B.1
    - Deep nested item

## Ordered List with Tasks

1. First ordered step
2. [ ] Task between ordered items
3. Second ordered step
4. [x] Completed task
5. Third ordered step

Mixed task and regular lists should preserve their structure and semantics through the Markdown pipeline.