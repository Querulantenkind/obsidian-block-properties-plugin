# Block Properties

Add metadata to individual blocks in [Obsidian](https://obsidian.md) using an extended block-ID syntax.

## The Problem

Obsidian's properties exist only at the note level. But knowledge isn't atomic — notes contain structure, and that structure carries meaning:

- **Documentation**: Some sections are stable, others deprecated, others experimental
- **Long-form writing**: Different passages have different states, POVs, timelines
- **Research**: Claims from different sources have different confidence levels

Currently, there's no way to attach metadata below the note level without fragmenting your content into separate files.

## The Solution

Block Properties extends Obsidian's block-ID syntax to support inline metadata:

```markdown
This section is stable. ^api-docs [status: stable, version: 2.0]

This needs review. ^draft-section [status: draft, reviewer: pending]
```

## Features

- **Inline Syntax**: Natural extension of existing `^block-id` syntax
- **Two Display Modes**:
  - *Inline*: Properties shown as dimmed text
  - *Badge*: Compact numbered badge
- **Hover Tooltips**: See all properties at a glance
- **Reading View Support**: Properties visible in both edit and reading mode
- **Query Command**: Find all blocks with specific properties across your vault
- **Property Panel**: Sidebar showing all block properties in the current note
- **Autocomplete**: Suggestions for keys and values based on your existing properties

## Syntax

```markdown
Basic:
^block-id [key: value]

Multiple properties:
^block-id [status: draft, priority: high, author: luca]
```

The properties appear after the block ID in square brackets, with key-value pairs separated by commas.

## Commands

| Command | Description |
|---------|-------------|
| `Insert block property` | Add a block property template at cursor |
| `Query block properties` | Search for blocks by property key/value |
| `Open property panel` | Show sidebar with all properties in current note |

## Installation

### Manual Installation

1. Download the latest release
2. Extract to `.obsidian/plugins/block-properties/`
3. Enable the plugin in Obsidian settings

### From Source

```bash
git clone https://codeberg.org/YOUR_USERNAME/obsidian-block-properties.git
cd obsidian-block-properties
npm install
npm run build
```

## Settings

| Setting | Description |
|---------|-------------|
| Display Mode | `Inline` (dimmed text) or `Badge` (compact icon) |
| Property Color | Color for property text |
| Opacity | Transparency level (0.1 - 1.0) |

## Use Cases

### Technical Documentation
```markdown
## Authentication API ^auth-api [status: stable, version: 2.0]

## Legacy Endpoints ^legacy [status: deprecated, removed-in: v3.0]
```

### Project Management
```markdown
Implement dashboard redesign. ^task-1 [status: in-progress, priority: high, assignee: luca]

Fix login bug. ^task-2 [status: blocked, blocker: api-team]
```

### Creative Writing
```markdown
The sun rose slowly. ^scene-1 [draft: 2, pov: narrator, timeline: present]

She remembered that summer. ^flashback-1 [draft: 1, pov: maria, timeline: past]
```

### Research Notes
```markdown
Smith (2023) argues for X. ^cite-1 [type: journal, supports: hypothesis-a]

Johnson (2022) contradicts this. ^cite-2 [type: book, contradicts: hypothesis-a]
```

## Roadmap

- [ ] Dataview integration (API for external queries)
- [ ] Property inheritance (section → subsection)
- [ ] Custom property types (date, link, number)
- [ ] Export/import properties

## Contributing

Contributions welcome! Please open an issue first to discuss major changes.

## License

[MIT](LICENSE)

## Credits

Developed with the help of Claude Code.

---

If you find this plugin useful, consider starring the repository!
