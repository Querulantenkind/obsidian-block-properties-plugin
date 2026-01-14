# Block Properties - Obsidian Plugin

## Overview

This plugin extends Obsidian's block reference syntax to include key-value properties.
Blocks can be annotated with metadata using the syntax: `^block-id [key: value, key2: value2]`

**v1.0.2+**: Property values can contain links to notes (`[[Note]]`) and blocks (`^block-id`).

**v1.0.3+**: Blocks receive CSS classes based on properties for conditional styling.

**v1.0.4+**: Bulk editing allows changing properties across the entire vault.

**v1.0.5+**: Block Graph View visualizes block relationships in an interactive graph.

## Tech Stack

- **Language:** TypeScript (strict mode)
- **Build:** esbuild via `esbuild.config.mjs`
- **Editor Integration:** CodeMirror 6 (ViewPlugin, Decoration)
- **Framework:** Obsidian Plugin API
- **Graph Visualization:** vis-network, vis-data (v1.0.5+)

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

  # Conditional Styling (v1.0.3)
  conditional-styles.ts # Generate CSS classes from properties

  # Bulk Editing (v1.0.4)
  bulk-edit.ts         # Vault-wide property editing modal

  # Block Graph View (v1.0.5)
  graph-view.ts        # Interactive graph visualization of block relationships

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

### Conditional Styling (v1.0.3)
```
^task [status: done, priority: high]
→ Classes: bp-status-done, bp-priority-high
```
- `conditional-styles.ts` generates `bp-{key}-{value}` classes
- Sanitizes values for CSS (lowercase, replace special chars with `-`)
- Styling target: `'property'` (text only) or `'line'` (entire line)
- Preset styles toggled via `.bp-use-presets` class on body
- Custom rules: `StyleRule { key, value, className }`
- Line decorations via `Decoration.line()` in CodeMirror

### Bulk Editing (v1.0.4)
```
status: draft → status: review (across all files)
```
- `bulk-edit.ts` provides `BulkEditModal`
- Reuses `searchBlockProperties()` from `query.ts`
- Groups results by file to minimize I/O operations
- Regex-based property replacement: `key: old` → `key: new`
- Preview shows affected blocks before applying
- Invalidates suggest cache after changes

### Block Graph View (v1.0.5)
```
^task-1 [blocked-by: ^task-2] → Graph edge: task-1 --blocked-by--> task-2
```
- `graph-view.ts` provides `BlockGraphView` extending `ItemView`
- Uses vis-network library for graph rendering
- Scans vault for blocks with `^block-id` references in property values
- Nodes represent blocks, edges represent relationships (property keys)
- Status-based coloring: done=green, blocked=red, in-progress=blue
- Double-click navigation via `navigateToBlock()` method
- Force-directed layout with ForceAtlas2 physics solver
- Theme-aware styling (light/dark mode detection)

## Commands

| ID | Name | Description |
|----|------|-------------|
| `insert-block-property` | Insert block property | Adds `^block-id [key: value]` |
| `insert-template` | Insert property template | Opens template picker |
| `query-block-properties` | Query block properties | Search vault by key/value |
| `open-property-panel` | Open property panel | Show sidebar panel |
| `bulk-edit-properties` | Bulk edit properties | Change values across vault |
| `open-block-graph` | Open block graph | Visualize block relationships |

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
| `enableConditionalStyling` | boolean | `true` |
| `stylingTarget` | `'property' \| 'line'` | `'property'` |
| `usePresetStyles` | boolean | `true` |
| `customStyleRules` | `StyleRule[]` | `[]` |

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

// Conditional styling (v1.0.3)
type StylingTarget = 'property' | 'line'
interface StyleRule { key: string; value: string; className: string }

// Graph View (v1.0.5)
interface GraphNode { id: string; label: string; file: string; title?: string; color?: string }
interface GraphEdge { id: string; from: string; to: string; label: string }
interface BlockInfo { blockId: string; file: TFile; properties: {key: string; value: string}[]; line: number }
```

## Gotchas

- `main.js` must be committed for Obsidian to load the plugin
- `minAppVersion` in manifest.json must match versions.json
- EditorExtension array is mutated in-place for hot reload (`refreshEditorExtension`)
- Panel uses `contentEl` (ItemView property), not `containerEl.children[1]`
- Link positions stored in WeakMap keyed by EditorView instance
- BacklinkIndexer uses debouncing to avoid excessive reindexing
- Block refs inside note links (`[[Note#^block]]`) are ignored by link-parser
- Preset styles require `.bp-use-presets` class on body (toggled via `updateStyles()`)
- Line decorations must be sorted by position for CodeMirror (use array + sort)
- Custom style rules use `*` as wildcard value to match any property value
- Graph View uses vis-network standalone build (includes vis-data)
- Graph node colors determined by `status` property value
- vis-network options require `margin` as object `{top, right, bottom, left}`, not number
- vis-network `smooth.enabled` must be explicitly set for edge curves
