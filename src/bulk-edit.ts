import {App, Modal, Notice, Setting, TFile} from 'obsidian';
import {searchBlockProperties, QueryResult} from './query';
import type BlockPropertiesPlugin from './main';

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Update a specific property value in a line.
 */
function updatePropertyInLine(line: string, key: string, newValue: string): string {
	const pattern = new RegExp(`(${escapeRegex(key)}:\\s*)([^,\\]]+)`);
	return line.replace(pattern, `$1${newValue}`);
}

/**
 * Apply bulk edits to multiple files.
 */
async function applyBulkEdit(
	app: App,
	results: QueryResult[],
	key: string,
	newValue: string
): Promise<{success: number; failed: number}> {
	// Group results by file to minimize file operations
	const byFile = new Map<string, QueryResult[]>();
	for (const r of results) {
		const path = r.file.path;
		if (!byFile.has(path)) byFile.set(path, []);
		byFile.get(path)!.push(r);
	}

	let success = 0;
	let failed = 0;

	for (const [path, fileResults] of byFile) {
		try {
			const file = app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) {
				failed += fileResults.length;
				continue;
			}

			const content = await app.vault.read(file);
			const lines = content.split('\n');

			// Sort by line number descending to preserve positions
			fileResults.sort((a, b) => b.line - a.line);

			for (const result of fileResults) {
				const line = lines[result.line];
				if (!line) {
					failed++;
					continue;
				}

				lines[result.line] = updatePropertyInLine(line, key, newValue);
				success++;
			}

			await app.vault.modify(file, lines.join('\n'));
		} catch (e) {
			failed += fileResults.length;
		}
	}

	return {success, failed};
}

export class BulkEditModal extends Modal {
	private plugin: BlockPropertiesPlugin;

	// Form state
	private selectedKey: string = '';
	private currentValue: string = '';
	private newValue: string = '';

	// Preview state
	private previewResults: QueryResult[] = [];
	private previewEl: HTMLElement | null = null;
	private applyBtn: HTMLButtonElement | null = null;

	constructor(app: App, plugin: BlockPropertiesPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.addClass('block-properties-bulk-edit-modal');
		contentEl.empty();

		contentEl.createEl('h2', {text: 'Bulk Edit Properties'});

		// Get available keys from suggest cache
		const suggest = this.plugin.getSuggest();
		const availableKeys = suggest ? Array.from(suggest.getKeys().keys()) : [];

		// Key dropdown
		new Setting(contentEl)
			.setName('Property key')
			.setDesc('Select the property key to edit')
			.addDropdown((dropdown) => {
				dropdown.addOption('', '-- Select key --');
				for (const key of availableKeys.sort()) {
					dropdown.addOption(key, key);
				}
				dropdown.setValue(this.selectedKey);
				dropdown.onChange((value) => {
					this.selectedKey = value;
					this.clearPreview();
				});
			});

		// Current value filter
		new Setting(contentEl)
			.setName('Current value')
			.setDesc('Leave empty to match any value')
			.addText((text) => {
				text.setPlaceholder('(any value)');
				text.setValue(this.currentValue);
				text.onChange((value) => {
					this.currentValue = value;
					this.clearPreview();
				});
			});

		// New value
		new Setting(contentEl)
			.setName('New value')
			.setDesc('The value to set for all matching properties')
			.addText((text) => {
				text.setPlaceholder('Enter new value');
				text.setValue(this.newValue);
				text.onChange((value) => {
					this.newValue = value;
				});
			});

		// Preview button
		new Setting(contentEl)
			.addButton((btn) => {
				btn.setButtonText('Preview Changes');
				btn.onClick(async () => {
					await this.loadPreview();
				});
			});

		// Preview container
		this.previewEl = contentEl.createEl('div', {
			cls: 'block-properties-bulk-preview-container',
		});

		// Action buttons
		const actionSetting = new Setting(contentEl);

		actionSetting.addButton((btn) => {
			btn.setButtonText('Cancel');
			btn.onClick(() => this.close());
		});

		actionSetting.addButton((btn) => {
			this.applyBtn = btn.buttonEl;
			btn.setButtonText('Apply Changes');
			btn.setCta();
			btn.setDisabled(true);
			btn.onClick(async () => {
				await this.applyChanges();
			});
		});
	}

	onClose() {
		this.contentEl.empty();
	}

	private clearPreview() {
		this.previewResults = [];
		if (this.previewEl) {
			this.previewEl.empty();
		}
		if (this.applyBtn) {
			this.applyBtn.disabled = true;
		}
	}

	private async loadPreview() {
		if (!this.selectedKey) {
			new Notice('Please select a property key');
			return;
		}

		if (!this.previewEl) return;
		this.previewEl.empty();

		// Show loading
		this.previewEl.createEl('p', {
			text: 'Searching...',
			cls: 'block-properties-bulk-loading',
		});

		// Search for matching blocks
		this.previewResults = await searchBlockProperties(
			this.app,
			this.selectedKey,
			this.currentValue || undefined
		);

		this.renderPreview();
	}

	private renderPreview() {
		if (!this.previewEl) return;
		this.previewEl.empty();

		const count = this.previewResults.length;

		// Show count
		const countEl = this.previewEl.createEl('p', {
			cls: 'block-properties-bulk-count',
		});

		if (count === 0) {
			countEl.textContent = 'No blocks found matching the criteria';
			if (this.applyBtn) this.applyBtn.disabled = true;
			return;
		}

		const valueFilter = this.currentValue ? `${this.selectedKey}: ${this.currentValue}` : this.selectedKey;
		countEl.textContent = `${count} block(s) with "${valueFilter}" will be updated`;

		// Enable apply button
		if (this.applyBtn) {
			this.applyBtn.disabled = !this.newValue;
		}

		// Show preview list
		const listEl = this.previewEl.createEl('div', {
			cls: 'block-properties-bulk-preview',
		});

		// Limit preview to 20 items
		const displayResults = this.previewResults.slice(0, 20);

		for (const result of displayResults) {
			const item = listEl.createEl('div', {
				cls: 'block-properties-bulk-preview-item',
			});

			// File and block ID
			item.createEl('div', {
				text: `${result.file.basename} → ^${result.blockId}`,
				cls: 'block-properties-bulk-preview-file',
			});

			// Current → New value
			const changeEl = item.createEl('div', {
				cls: 'block-properties-bulk-preview-change',
			});

			const currentProp = result.properties.find((p) => p.key === this.selectedKey);
			const oldValue = currentProp?.value || '';

			const oldSpan = changeEl.createEl('span', {
				text: `${this.selectedKey}: ${oldValue}`,
				cls: 'block-properties-bulk-preview-old',
			});

			changeEl.createEl('span', {text: ' → '});

			const newSpan = changeEl.createEl('span', {
				text: `${this.selectedKey}: ${this.newValue || '(empty)'}`,
				cls: 'block-properties-bulk-preview-new',
			});
		}

		if (this.previewResults.length > 20) {
			listEl.createEl('div', {
				text: `... and ${this.previewResults.length - 20} more`,
				cls: 'block-properties-bulk-preview-more',
			});
		}
	}

	private async applyChanges() {
		if (!this.selectedKey || this.previewResults.length === 0) {
			new Notice('Nothing to update');
			return;
		}

		if (!this.newValue) {
			new Notice('Please enter a new value');
			return;
		}

		// Check if same value
		if (this.currentValue && this.currentValue === this.newValue) {
			new Notice('New value is the same as current value');
			return;
		}

		// Apply changes
		const result = await applyBulkEdit(
			this.app,
			this.previewResults,
			this.selectedKey,
			this.newValue
		);

		// Show result
		if (result.failed === 0) {
			new Notice(`Updated ${result.success} block(s)`);
		} else {
			new Notice(`Updated ${result.success} block(s), ${result.failed} failed`);
		}

		// Refresh suggest cache
		const suggest = this.plugin.getSuggest();
		if (suggest) {
			suggest.invalidateCache();
		}

		this.close();
	}
}
