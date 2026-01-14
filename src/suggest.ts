import {
	Editor,
	EditorPosition,
	EditorSuggest,
	EditorSuggestContext,
	EditorSuggestTriggerInfo,
	TFile,
} from 'obsidian';
import type BlockPropertiesPlugin from './main';
import {parseBlockProperties} from './parser';
import type {PropertyTemplate} from './types';

interface Suggestion {
	type: 'key' | 'value' | 'template' | 'note-link' | 'block-ref';
	text: string;
	count: number;
	template?: PropertyTemplate;
	filePath?: string; // For note links
}

export class BlockPropertiesSuggest extends EditorSuggest<Suggestion> {
	plugin: BlockPropertiesPlugin;
	private cachedKeys: Map<string, number> = new Map();
	private cachedValues: Map<string, Map<string, number>> = new Map();
	private cachedBlockIds: Map<string, string> = new Map(); // blockId -> filePath
	private lastCacheUpdate = 0;
	private readonly CACHE_TTL = 30000; // 30 seconds

	constructor(plugin: BlockPropertiesPlugin) {
		super(plugin.app);
		this.plugin = plugin;
	}

	onTrigger(
		cursor: EditorPosition,
		editor: Editor,
		file: TFile | null
	): EditorSuggestTriggerInfo | null {
		const line = editor.getLine(cursor.line);

		// Check if we're inside a block property bracket [...]
		const beforeCursor = line.slice(0, cursor.ch);
		const afterCursor = line.slice(cursor.ch);

		// Find the last [ before cursor
		const bracketStart = beforeCursor.lastIndexOf('[');
		if (bracketStart === -1) return null;

		// Make sure there's no ] between [ and cursor
		const textInBracket = beforeCursor.slice(bracketStart + 1);
		if (textInBracket.includes(']')) return null;

		// Make sure this is a block property (has ^id before [)
		const beforeBracket = line.slice(0, bracketStart);
		if (!beforeBracket.match(/\^[\w-]+\s*$/)) return null;

		// Determine if we're typing a key or value
		const lastComma = textInBracket.lastIndexOf(',');
		const lastColon = textInBracket.lastIndexOf(':');

		let start: number;
		let query: string;

		if (lastColon > lastComma) {
			// We're typing a value (after colon)
			start = bracketStart + 1 + lastColon + 1;
			query = textInBracket.slice(lastColon + 1).trim();
		} else {
			// We're typing a key (after comma or at start)
			start = bracketStart + 1 + (lastComma === -1 ? 0 : lastComma + 1);
			query = lastComma === -1
				? textInBracket.trim()
				: textInBracket.slice(lastComma + 1).trim();
		}

		return {
			start: {line: cursor.line, ch: start},
			end: cursor,
			query,
		};
	}

	async getSuggestions(context: EditorSuggestContext): Promise<Suggestion[]> {
		await this.updateCache();

		const line = context.editor.getLine(context.start.line);
		const beforeCursor = line.slice(0, context.end.ch);
		const bracketStart = beforeCursor.lastIndexOf('[');
		const textInBracket = beforeCursor.slice(bracketStart + 1);

		const lastComma = textInBracket.lastIndexOf(',');
		const lastColon = textInBracket.lastIndexOf(':');

		const query = context.query.toLowerCase();

		if (lastColon > lastComma) {
			// We're typing a value
			const keyStart = lastComma === -1 ? 0 : lastComma + 1;
			const currentKey = textInBracket.slice(keyStart, lastColon).trim();
			const valueText = textInBracket.slice(lastColon + 1);

			// Check for link context within value
			const linkContext = this.detectLinkContext(valueText);

			if (linkContext?.type === 'note') {
				// Suggest notes for [[
				return this.getNoteSuggestions(linkContext.query);
			}

			if (linkContext?.type === 'block') {
				// Suggest block IDs for ^
				return this.getBlockSuggestions(linkContext.query);
			}

			// If the key is "preset", suggest template names
			if (currentKey === 'preset') {
				return this.plugin.settings.templates
					.filter((t) => t.name.toLowerCase().includes(query))
					.map((t) => ({
						type: 'template' as const,
						text: t.name,
						count: t.properties.length,
						template: t,
					}));
			}

			const values = this.cachedValues.get(currentKey) || new Map();
			return Array.from(values.entries())
				.filter(([value]) => value.toLowerCase().includes(query))
				.map(([text, count]) => ({type: 'value' as const, text, count}))
				.sort((a, b) => b.count - a.count)
				.slice(0, 10);
		} else {
			// Suggest keys
			const suggestions = Array.from(this.cachedKeys.entries())
				.filter(([key]) => key.toLowerCase().includes(query))
				.map(([text, count]) => ({type: 'key' as const, text, count}))
				.sort((a, b) => b.count - a.count)
				.slice(0, 10);

			// Add "preset" as a special key if it matches and templates exist
			if (
				'preset'.includes(query) &&
				this.plugin.settings.templates.length > 0 &&
				!suggestions.find((s) => s.text === 'preset')
			) {
				suggestions.unshift({
					type: 'key' as const,
					text: 'preset',
					count: this.plugin.settings.templates.length,
				});
			}

			return suggestions;
		}
	}

	private detectLinkContext(text: string): {type: 'note' | 'block'; query: string} | null {
		// Check if we're inside an unclosed [[ for note links
		const lastDoubleBracket = text.lastIndexOf('[[');
		if (lastDoubleBracket !== -1) {
			const afterBracket = text.slice(lastDoubleBracket + 2);
			// Make sure it's not closed
			if (!afterBracket.includes(']]')) {
				return {type: 'note', query: afterBracket.trim()};
			}
		}

		// Check if we're after ^ for block references
		const lastCaret = text.lastIndexOf('^');
		if (lastCaret !== -1) {
			const afterCaret = text.slice(lastCaret + 1);
			// Only suggest if it looks like a block ID being typed (word chars)
			if (/^[\w-]*$/.test(afterCaret)) {
				return {type: 'block', query: afterCaret};
			}
		}

		return null;
	}

	private getNoteSuggestions(query: string): Suggestion[] {
		const files = this.app.vault.getMarkdownFiles();
		const lowerQuery = query.toLowerCase();

		return files
			.filter((f) => f.basename.toLowerCase().includes(lowerQuery))
			.slice(0, 10)
			.map((f) => ({
				type: 'note-link' as const,
				text: f.basename,
				count: 0,
				filePath: f.path,
			}));
	}

	private getBlockSuggestions(query: string): Suggestion[] {
		const lowerQuery = query.toLowerCase();

		return Array.from(this.cachedBlockIds.entries())
			.filter(([blockId]) => blockId.toLowerCase().includes(lowerQuery))
			.slice(0, 10)
			.map(([blockId, filePath]) => {
				const file = this.app.vault.getAbstractFileByPath(filePath);
				const fileName = file instanceof TFile ? file.basename : filePath;
				return {
					type: 'block-ref' as const,
					text: blockId,
					count: 0,
					filePath: fileName,
				};
			});
	}

	renderSuggestion(suggestion: Suggestion, el: HTMLElement): void {
		el.addClass('block-properties-suggestion');

		el.createEl('span', {
			text: suggestion.text,
			cls: 'block-properties-suggestion-text',
		});

		const meta = el.createEl('span', {
			cls: 'block-properties-suggestion-meta',
		});

		let typeLabel: string;
		switch (suggestion.type) {
			case 'template':
				typeLabel = 'template';
				break;
			case 'key':
				typeLabel = 'key';
				break;
			case 'note-link':
				typeLabel = 'note';
				break;
			case 'block-ref':
				typeLabel = 'block';
				break;
			default:
				typeLabel = 'value';
		}

		meta.createEl('span', {
			text: typeLabel,
			cls: `block-properties-suggestion-type block-properties-suggestion-type-${suggestion.type}`,
		});

		// Show count for regular suggestions, file path for links
		if (suggestion.type === 'note-link' || suggestion.type === 'block-ref') {
			if (suggestion.filePath) {
				meta.createEl('span', {
					text: suggestion.filePath,
					cls: 'block-properties-suggestion-path',
				});
			}
		} else {
			meta.createEl('span', {
				text: `${suggestion.count}`,
				cls: 'block-properties-suggestion-count',
			});
		}

		// Show template preview
		if (suggestion.type === 'template' && suggestion.template) {
			el.createEl('div', {
				text: suggestion.template.properties
					.map((p) => `${p.key}: ${p.value || '...'}`)
					.join(', '),
				cls: 'block-properties-suggestion-preview',
			});
		}
	}

	selectSuggestion(suggestion: Suggestion, evt: MouseEvent | KeyboardEvent): void {
		if (!this.context) return;

		const {editor, start, end} = this.context;
		const line = editor.getLine(start.line);

		// Handle template expansion
		if (
			suggestion.type === 'template' &&
			suggestion.template &&
			this.plugin.settings.autoExpandPresets
		) {
			// Find the bracket start to replace the entire property block
			const bracketStart = line.lastIndexOf('[', start.ch);
			const bracketEnd = line.indexOf(']', end.ch);

			if (bracketStart !== -1 && bracketEnd !== -1) {
				const propsStr = suggestion.template.properties
					.map((p) => `${p.key}: ${p.value}`)
					.join(', ');

				editor.replaceRange(
					`[${propsStr}]`,
					{line: start.line, ch: bracketStart},
					{line: start.line, ch: bracketEnd + 1}
				);

				// Move cursor to end
				const newCh = bracketStart + propsStr.length + 2;
				editor.setCursor({line: start.line, ch: newCh});
				return;
			}
		}

		let replacement = suggestion.text;
		let adjustStart = start;

		if (suggestion.type === 'key') {
			replacement = suggestion.text + ': ';
		} else if (suggestion.type === 'note-link') {
			// Replace from [[ to cursor
			const beforeCursor = line.slice(0, end.ch);
			const bracketPos = beforeCursor.lastIndexOf('[[');
			if (bracketPos !== -1) {
				adjustStart = {line: start.line, ch: bracketPos};
				replacement = `[[${suggestion.text}]]`;
			}
		} else if (suggestion.type === 'block-ref') {
			// Replace from ^ to cursor
			const beforeCursor = line.slice(0, end.ch);
			const caretPos = beforeCursor.lastIndexOf('^');
			if (caretPos !== -1) {
				adjustStart = {line: start.line, ch: caretPos};
				replacement = `^${suggestion.text}`;
			}
		}

		editor.replaceRange(replacement, adjustStart, end);

		// Move cursor after the replacement
		const newCh = adjustStart.ch + replacement.length;
		editor.setCursor({line: start.line, ch: newCh});
	}

	private async updateCache() {
		const now = Date.now();
		if (now - this.lastCacheUpdate < this.CACHE_TTL) {
			return;
		}

		this.cachedKeys.clear();
		this.cachedValues.clear();
		this.cachedBlockIds.clear();

		const files = this.app.vault.getMarkdownFiles();

		for (const file of files) {
			try {
				const content = await this.app.vault.cachedRead(file);
				const lines = content.split('\n');

				for (const line of lines) {
					const props = parseBlockProperties(line);

					for (const prop of props) {
						// Cache block ID (first occurrence wins)
						if (!this.cachedBlockIds.has(prop.blockId)) {
							this.cachedBlockIds.set(prop.blockId, file.path);
						}

						for (const p of prop.properties) {
							// Count keys
							this.cachedKeys.set(
								p.key,
								(this.cachedKeys.get(p.key) || 0) + 1
							);

							// Count values per key
							if (!this.cachedValues.has(p.key)) {
								this.cachedValues.set(p.key, new Map());
							}
							const valueMap = this.cachedValues.get(p.key)!;
							valueMap.set(p.value, (valueMap.get(p.value) || 0) + 1);
						}
					}

					// Also find standalone block IDs (without properties)
					const standaloneBlockIds = line.matchAll(/\^([\w-]+)(?!\s*\[)/g);
					for (const match of standaloneBlockIds) {
						const blockId = match[1];
						if (blockId && !this.cachedBlockIds.has(blockId)) {
							this.cachedBlockIds.set(blockId, file.path);
						}
					}
				}
			} catch {
				// Skip files that can't be read
			}
		}

		this.lastCacheUpdate = now;
	}

	getKeys(): Map<string, number> {
		return this.cachedKeys;
	}

	getValuesForKey(key: string): Map<string, number> {
		return this.cachedValues.get(key) || new Map();
	}

	async refreshCache(): Promise<void> {
		this.lastCacheUpdate = 0;
		await this.updateCache();
	}

	invalidateCache(): void {
		this.lastCacheUpdate = 0;
	}
}
