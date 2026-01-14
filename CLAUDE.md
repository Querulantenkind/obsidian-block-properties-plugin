# Block Properties - Obsidian Plugin

## Overview

This plugin extends Obsidian's block reference syntax to include key-value properties.
Blocks can be annotated with metadata using the syntax: `^block-id [key: value, key2: value2]`

**v1.0.2+**: Property values can contain links to notes (`[[Note]]`) and blocks (`^block-id`).

## Tech Stack

- **Language:** TypeScript (strict mode)
- **Build:** esbuild via `esbuild.config.mjs`
- **Editor Integration:** CodeMirror 6 (ViewPlugin, Decoration)
- **Framework:** Obsidian Plugin API

## Project Structure

```
src/
  main.ts              # Plugin entry point, commands, lifecycle
  types.ts             # Interfaces, settings, defaults
  parser.ts            # Regex-based block property parser
  editor-extension.ts  # CodeMirror decorations (inline/badge modes)
  panel.ts             # Sidebar panel view with inline editing
  suggest.ts           # EditorSuggest autocomplete system
  query.ts             # Search modal and vault-wide property search
  settings.ts          # Settings tab UI
  template-modal.ts    # Template picker and editor modals

  # Linked Properties (v1.0.2)
  link-parser.ts       # Parse [[Note]] and ^block-id in values
  link-resolver.ts     # Resolve and navigate to linked targets
  backlink-index.ts    # Track incoming references between blocks

styles.css             # All plugin styles
assets/                # Screenshots for README
```

## Key Patterns

### Block Property Syntax
```
Some text ^my-block [status: draft, priority: high]
```
- Block ID: `^[\w-]+`
- Properties: `[key: value, ...]`
- Parser in `parser.ts` extracts both

### Linked Properties (v1.0.2)
```
^task [blocked-by: ^other-task, docs: [[Project Notes]]]
```
- Note links: `\[\[([^\]|]+)(?:\|([^\]]+))?\]\]`
- Block refs: `\^([\w-]+)` (not inside note links)
- `link-parser.ts` extracts `ParsedLink[]` from values
- `link-resolver.ts` handles navigation
- `backlink-index.ts` maintains reverse lookup

### CodeMirror Integration
- `editor-extension.ts` creates ViewPlugin with Decorations
- Two display modes: `inline` (dimmed text) and `badge` (compact count)
- Link decorations with `block-property-link` class
- Cmd/Ctrl+Click handler via `EditorView.domEventHandlers`
- Link positions stored in WeakMap for click detection

### Autocomplete System
- `suggest.ts` extends `EditorSuggest`
- Caches keys/values/blockIds from vault (30s TTL)
- Special `preset:` key triggers template suggestions
- `[[` triggers note suggestions
- `^` triggers block ID suggestions
- Auto-expand replaces `preset: name` with full template

### Panel Features
- `panel.ts` provides ItemView in right sidebar
- Inline editing: click value to edit, dropdown with suggestions
- Link values rendered as clickable `<a>` elements
- "Referenced by" section shows backlinks to current blocks
- File modification via `app.vault.modify()`

### Backlink Index
- `BacklinkIndexer` extends `Events` for change notifications
- In-memory `Map<targetId, BacklinkEntry[]>`
- Listens to vault modify/delete/rename events
- Debounced updates (500ms) for performance
- Built on workspace ready, updated incrementally

## Commands

| ID | Name | Description |
|----|------|-------------|
| `insert-block-property` | Insert block property | Adds `^block-id [key: value]` |
| `insert-template` | Insert property template | Opens template picker |
| `query-block-properties` | Query block properties | Search vault by key/value |
| `open-property-panel` | Open property panel | Show sidebar panel |

## Settings

| Setting | Type | Default |
|---------|------|---------|
| `displayMode` | `'inline' \| 'badge'` | `'inline'` |
| `propertyColor` | string (hex) | `'#888888'` |
| `opacity` | number (0.1-1.0) | `0.6` |
| `templates` | `PropertyTemplate[]` | task template |
| `autoExpandPresets` | boolean | `true` |
| `enableLinkedProperties` | boolean | `true` |
| `showBacklinksInPanel` | boolean | `true` |

## Development

```bash
# Build for production
npm run build

# Development mode (watch)
npm run dev

# Lint
npm run lint
```

## Testing in Obsidian

1. Build the plugin: `npm run build`
2. Reload Obsidian or use "Reload app without saving" (Cmd/Ctrl+R)
3. Enable plugin in Settings > Community plugins

## Code Style

- Tabs for indentation (width 2)
- No semicolons in most cases (Obsidian convention)
- Prefer `const {contentEl} = this` destructuring
- Use Obsidian's `createEl()` for DOM creation
- TypeScript strict null checks enabled

## Important Files for Releases

- `manifest.json` - Plugin metadata, version
- `package.json` - npm metadata, version
- `versions.json` - Obsidian version compatibility map
- `main.js` - Compiled output (committed for releases)

## Type Definitions

```typescript
// Core types
interface BlockProperty { key: string; value: string; parsedValue?: ParsedValue }
interface BlockProperties { blockId: string; properties: BlockProperty[]; from: number; to: number }

// Linked properties (v1.0.2)
type LinkType = 'note' | 'block'
interface ParsedLink { type: LinkType; raw: string; target: string; alias?: string }
interface ParsedValue { raw: string; links: ParsedLink[] }
interface BacklinkEntry { sourceFile: string; sourceBlockId: string; key: string; line: number }
```

## Gotchas

- `main.js` must be committed for Obsidian to load the plugin
- `minAppVersion` in manifest.json must match versions.json
- EditorExtension array is mutated in-place for hot reload (`refreshEditorExtension`)
- Panel uses `contentEl` (ItemView property), not `containerEl.children[1]`
- Link positions stored in WeakMap keyed by EditorView instance
- BacklinkIndexer uses debouncing to avoid excessive reindexing
- Block refs inside note links (`[[Note#^block]]`) are ignored by link-parser
