<div align="center">

# Block Properties

**Add metadata to individual blocks in Obsidian**

[![GitHub release](https://img.shields.io/github/v/release/Querulantenkind/obsidian-block-properties-plugin?style=flat-square)](https://github.com/Querulantenkind/obsidian-block-properties-plugin/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)
[![Obsidian](https://img.shields.io/badge/Obsidian-0.15.0+-7C3AED?style=flat-square&logo=obsidian&logoColor=white)](https://obsidian.md)

*Extend block-ID syntax with inline key-value properties*

![Block Properties in action](assets/Showcase_Block_Properties.png)

</div>

---

## Quick Start

```markdown
Any paragraph with a block ID. ^my-block [status: draft, priority: high]
```

That's it. Properties appear after the block ID in `[key: value]` format.

---

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
- **Inline Panel Editing**: Click any value to edit it directly in the sidebar
- **Autocomplete**: Suggestions for keys and values based on your existing properties
- **Property Templates**: Create reusable presets for common property combinations

### Property Panel

![Property Panel](assets/Property_Panel.png)
*The Property Panel shows all blocks with properties in the current note, with clickable links for quick navigation*

### Property Templates

Define reusable property sets in Settings for common patterns:

```
Template: "task"
Properties: status: todo, priority: medium, assignee: (empty)
```

Use templates via:
- **Command**: "Insert property template" opens a picker
- **Autocomplete**: Type `preset: task` and it auto-expands to the full property set

### Inline Panel Editing

Edit properties directly in the sidebar panel:
- **Click** any value to edit it inline
- **Dropdown** shows existing values from your vault
- **Add** new properties with the "+ Add property" button
- **Delete** properties with the × button

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
| `Insert property template` | Choose from saved templates to insert |
| `Query block properties` | Search for blocks by property key/value |
| `Open property panel` | Show sidebar with all properties in current note |

## Installation

### Manual Installation

1. Download the latest release
2. Extract to `.obsidian/plugins/block-properties/`
3. Enable the plugin in Obsidian settings

### From Source

```bash
git clone https://codeberg.org/Krampus/obsidian-block-properties-plugin.git
cd obsidian-block-properties-plugin
npm install
npm run build
```

## Settings

| Setting | Description |
|---------|-------------|
| Display Mode | `Inline` (dimmed text) or `Badge` (compact icon) |
| Property Color | Color for property text |
| Opacity | Transparency level (0.1 - 1.0) |
| Auto-expand presets | Automatically expand `preset: name` to full template |
| Property Templates | Create, edit, and delete reusable property sets |

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

## FAQ

**Q: How is this different from YAML frontmatter properties?**
A: Frontmatter applies to the entire note. Block Properties apply to individual paragraphs, lists, or sections within a note.

**Q: Do block properties work with Dataview?**
A: Not yet. Dataview integration is on the roadmap. Currently, use the built-in Query command to search properties.

**Q: Can I use block properties without a block ID?**
A: No. The syntax requires a block ID (`^block-id`) before the properties. This ensures each block remains linkable.

**Q: Will this break my existing block references?**
A: No. Standard block IDs (`^block-id`) work exactly as before. Properties are purely additive.

## Limitations

- **No nested properties**: Values are plain strings, no objects or arrays
- **No property types**: All values are treated as text (no dates, numbers, or links yet)
- **Single line only**: Properties must be on the same line as the block ID
- **No Dataview integration**: Queries are plugin-internal only (for now)
- **No mobile testing**: Should work, but not extensively tested on mobile

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
