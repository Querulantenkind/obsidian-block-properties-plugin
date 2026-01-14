import {App, Events, EventRef, TFile} from 'obsidian';
import {BacklinkEntry} from './types';
import {parseBlockProperties} from './parser';
import {parseLinksInValue} from './link-parser';

/**
 * Indexes and tracks backlinks between blocks via property values
 */
export class BacklinkIndexer extends Events {
	private app: App;
	private index: Map<string, BacklinkEntry[]> = new Map();
	private fileEventRefs: EventRef[] = [];
	private isBuilding = false;
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly DEBOUNCE_MS = 500;

	constructor(app: App) {
		super();
		this.app = app;
	}

	/**
	 * Build the complete backlink index from scratch
	 */
	async buildIndex(): Promise<void> {
		if (this.isBuilding) return;
		this.isBuilding = true;

		this.index.clear();

		const files = this.app.vault.getMarkdownFiles();
		for (const file of files) {
			await this.indexFile(file);
		}

		this.isBuilding = false;
		this.trigger('index-updated');
	}

	/**
	 * Index a single file and add its links to the index
	 */
	async indexFile(file: TFile): Promise<void> {
		// Remove existing entries for this file first
		this.removeFileFromIndex(file.path);

		const content = await this.app.vault.cachedRead(file);
		const lines = content.split('\n');

		for (let lineNum = 0; lineNum < lines.length; lineNum++) {
			const line = lines[lineNum];
			if (!line) continue;

			const props = parseBlockProperties(line);

			for (const prop of props) {
				for (const p of prop.properties) {
					const parsed = parseLinksInValue(p.value);

					for (const link of parsed.links) {
						const targetKey = link.type === 'note'
							? this.normalizeNotePath(link.target)
							: `^${link.target}`;

						const entry: BacklinkEntry = {
							sourceFile: file.path,
							sourceBlockId: prop.blockId,
							key: p.key,
							line: lineNum,
						};

						const existing = this.index.get(targetKey);
						if (existing) {
							existing.push(entry);
						} else {
							this.index.set(targetKey, [entry]);
						}
					}
				}
			}
		}
	}

	/**
	 * Remove all index entries originating from a file
	 */
	private removeFileFromIndex(filePath: string): void {
		for (const [key, entries] of this.index.entries()) {
			const filtered = entries.filter(e => e.sourceFile !== filePath);
			if (filtered.length === 0) {
				this.index.delete(key);
			} else {
				this.index.set(key, filtered);
			}
		}
	}

	/**
	 * Normalize note path for consistent lookup
	 */
	private normalizeNotePath(linkText: string): string {
		// Add .md extension if missing
		return linkText.endsWith('.md') ? linkText : `${linkText}.md`;
	}

	/**
	 * Get all blocks that reference a specific block ID
	 */
	getBacklinksForBlock(blockId: string): BacklinkEntry[] {
		return this.index.get(`^${blockId}`) || [];
	}

	/**
	 * Get all blocks that reference a specific note
	 */
	getBacklinksForNote(notePath: string): BacklinkEntry[] {
		return this.index.get(this.normalizeNotePath(notePath)) || [];
	}

	/**
	 * Get all backlinks for a file (both note links and block refs in that file)
	 */
	async getBacklinksForFile(file: TFile): Promise<Map<string, BacklinkEntry[]>> {
		const result = new Map<string, BacklinkEntry[]>();

		// Get backlinks to the note itself
		const noteBacklinks = this.getBacklinksForNote(file.path);
		if (noteBacklinks.length > 0) {
			result.set(file.basename, noteBacklinks);
		}

		// Get backlinks to blocks in this file
		const content = await this.app.vault.cachedRead(file);
		const props = parseBlockProperties(content);

		for (const prop of props) {
			const blockBacklinks = this.getBacklinksForBlock(prop.blockId);
			if (blockBacklinks.length > 0) {
				result.set(`^${prop.blockId}`, blockBacklinks);
			}
		}

		return result;
	}

	/**
	 * Register file system event handlers for incremental updates
	 */
	registerFileEvents(): void {
		this.fileEventRefs.push(
			this.app.vault.on('modify', (file) => {
				if (file instanceof TFile && file.extension === 'md') {
					this.debouncedIndexFile(file);
				}
			}),
			this.app.vault.on('delete', (file) => {
				if (file instanceof TFile) {
					this.removeFileFromIndex(file.path);
					this.trigger('index-updated');
				}
			}),
			this.app.vault.on('rename', (file, oldPath) => {
				if (file instanceof TFile && file.extension === 'md') {
					this.removeFileFromIndex(oldPath);
					this.debouncedIndexFile(file);
				}
			})
		);
	}

	/**
	 * Debounced file indexing to avoid excessive updates during rapid edits
	 */
	private debouncedIndexFile(file: TFile): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}

		this.debounceTimer = setTimeout(async () => {
			await this.indexFile(file);
			this.trigger('index-updated');
			this.debounceTimer = null;
		}, this.DEBOUNCE_MS);
	}

	/**
	 * Unregister file system event handlers
	 */
	unregisterFileEvents(): void {
		for (const ref of this.fileEventRefs) {
			this.app.vault.offref(ref);
		}
		this.fileEventRefs = [];

		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
	}

	/**
	 * Get index statistics for debugging
	 */
	getStats(): {targets: number; totalBacklinks: number} {
		let totalBacklinks = 0;
		for (const entries of this.index.values()) {
			totalBacklinks += entries.length;
		}
		return {
			targets: this.index.size,
			totalBacklinks,
		};
	}
}
