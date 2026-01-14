# Block Properties - Obsidian Plugin

## Overview

This plugin extends Obsidian's block reference syntax to include key-value properties.
Blocks can be annotated with metadata using the syntax: `^block-id [key: value, key2: value2]`

## Tech Stack

- **Language:** TypeScript (strict mode)
- **Build:** esbuild via `esbuild.config.mjs`
- **Editor Integration:** CodeMirror 6 (ViewPlugin, Decoration)
- **Framework:** Obsidian Plugin API

## Project Structure

```
src/
  main.ts           # Plugin entry point, commands, lifecycle
  types.ts          # Interfaces, settings, defaults
  parser.ts         # Regex-based block property parser
  editor-extension.ts  # CodeMirror decorations (inline/badge modes)
  panel.ts          # Sidebar panel view with inline editing
  suggest.ts        # EditorSuggest autocomplete system
  query.ts          # Search modal and vault-wide property search
  settings.ts       # Settings tab UI
  template-modal.ts # Template picker and editor modals
styles.css          # All plugin styles
```

## Key Patterns

### Block Property Syntax
```
Some text ^my-block [status: draft, priority: high]
```
- Block ID: `^[\w-]+`
- Properties: `[key: value, ...]`
- Parser in `parser.ts` extracts both

### CodeMirror Integration
- `editor-extension.ts` creates ViewPlugin with Decorations
- Two display modes: `inline` (dimmed text) and `badge` (compact count)
- Decorations replace the `[...]` portion visually

### Autocomplete System
- `suggest.ts` extends `EditorSuggest`
- Caches all keys/values from vault (30s TTL)
- Special `preset:` key triggers template suggestions
- Auto-expand replaces `preset: name` with full template

### Panel Editing
- `panel.ts` provides ItemView in right sidebar
- Inline editing: click value to edit, dropdown with suggestions
- File modification via `app.vault.modify()`

## Commands

| ID | Name | Description |
|----|------|-------------|
| `insert-block-property` | Insert block property | Adds `^block-id [key: value]` |
| `insert-template` | Insert property template | Opens template picker |
| `query-block-properties` | Query block properties | Search vault by key/value |
| `open-property-panel` | Open property panel | Show sidebar panel |

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

## Gotchas

- `main.js` must be committed for Obsidian to load the plugin
- `minAppVersion` in manifest.json must match versions.json
- EditorExtension array is mutated in-place for hot reload (`refreshEditorExtension`)
- Panel uses `contentEl` (ItemView property), not `containerEl.children[1]`
