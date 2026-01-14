import {ItemView, MarkdownView, Notice, TFile, WorkspaceLeaf} from 'obsidian';
import {parseBlockProperties} from './parser';
import {parseLinksInValue, getLinkPositions} from './link-parser';
import {navigateToLink} from './link-resolver';
import {getConditionalClasses} from './conditional-styles';
import {ParsedLink, BacklinkEntry} from './types';
import type BlockPropertiesPlugin from './main';

export const PANEL_VIEW_TYPE = 'block-properties-panel';

interface PanelBlock {
	blockId: string;
	properties: {key: string; value: string}[];
	line: number;
	context: string;
	blockStart: number;
	propsStart: number;
	propsEnd: number;
}

export class PropertyPanelView extends ItemView {
	plugin: BlockPropertiesPlugin;
	private currentFile: TFile | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: BlockPropertiesPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return PANEL_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Block Properties';
	}

	getIcon(): string {
		return 'tag';
	}

	async onOpen() {
		this.renderPanel();
	}

	async onClose() {
		// Cleanup
	}

	async updateForFile(file: TFile | null) {
		this.currentFile = file;
		this.renderPanel();
	}

	private async renderPanel() {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.addClass('block-properties-panel');

		const header = contentEl.createEl('div', {
			cls: 'block-properties-panel-header',
		});

		if (!this.currentFile) {
			header.createEl('h4', {text: 'Block Properties'});
			contentEl.createEl('p', {
				text: 'No file open',
				cls: 'block-properties-panel-empty',
			});
			return;
		}

		header.createEl('h4', {text: this.currentFile.basename});

		const content = await this.app.vault.cachedRead(this.currentFile);
		const blocks = this.extractBlocks(content);

		if (blocks.length === 0) {
			contentEl.createEl('p', {
				text: 'No block properties found',
				cls: 'block-properties-panel-empty',
			});
			return;
		}

		const countEl = contentEl.createEl('p', {
			cls: 'block-properties-panel-count',
		});
		countEl.textContent = `${blocks.length} block(s) with properties`;

		const list = contentEl.createEl('div', {
			cls: 'block-properties-panel-list',
		});

		for (const block of blocks) {
			// Get conditional classes for this block
			const conditionalClasses = getConditionalClasses(block.properties, this.plugin.settings);
			const itemClasses = ['block-properties-panel-item', ...conditionalClasses];

			const item = list.createEl('div', {
				cls: itemClasses.join(' '),
			});

			const itemHeader = item.createEl('div', {
				cls: 'block-properties-panel-item-header',
			});

			const blockLink = itemHeader.createEl('a', {
				text: `^${block.blockId}`,
				cls: 'block-properties-panel-link',
			});

			blockLink.addEventListener('click', () => {
				this.navigateToBlock(block.line);
			});

			if (block.context) {
				itemHeader.createEl('span', {
					text: block.context,
					cls: 'block-properties-panel-context',
				});
			}

			const props = item.createEl('div', {
				cls: 'block-properties-panel-props',
			});

			for (const p of block.properties) {
				const propEl = props.createEl('div', {
					cls: 'block-properties-panel-prop',
				});

				propEl.createEl('span', {
					text: p.key,
					cls: 'block-properties-panel-key',
				});

				const valueContainer = propEl.createEl('div', {
					cls: 'block-properties-panel-value-container',
				});

				this.renderPropertyValue(valueContainer, p.value, block, p.key);

				const deleteBtn = propEl.createEl('button', {
					cls: 'block-properties-panel-delete-btn',
					attr: {'aria-label': 'Delete property'},
				});
				deleteBtn.innerHTML = '&times;';
				deleteBtn.addEventListener('click', () => {
					this.deleteProperty(block, p.key);
				});
			}

			const addPropBtn = props.createEl('button', {
				text: '+ Add property',
				cls: 'block-properties-panel-add-btn',
			});
			addPropBtn.addEventListener('click', () => {
				this.startAddingProperty(props, block, addPropBtn);
			});
		}

		// Backlinks section
		if (this.plugin.settings.showBacklinksInPanel) {
			await this.renderBacklinks(contentEl, blocks);
		}

		// Summary section
		const summary = contentEl.createEl('div', {
			cls: 'block-properties-panel-summary',
		});

		summary.createEl('h5', {text: 'Summary'});

		const keyCount = this.countKeys(blocks);
		const summaryList = summary.createEl('div', {
			cls: 'block-properties-panel-summary-list',
		});

		for (const [key, count] of Object.entries(keyCount)) {
			const summaryItem = summaryList.createEl('div', {
				cls: 'block-properties-panel-summary-item',
			});

			summaryItem.createEl('span', {
				text: key,
				cls: 'block-properties-panel-summary-key',
			});

			summaryItem.createEl('span', {
				text: `${count}`,
				cls: 'block-properties-panel-summary-count',
			});
		}
	}

	private extractBlocks(content: string): PanelBlock[] {
		const blocks: PanelBlock[] = [];
		const lines = content.split('\n');

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (!line) continue;

			const props = parseBlockProperties(line);

			for (const prop of props) {
				const context = line.slice(0, prop.from).trim().slice(0, 40);

				// Find bracket positions within the line
				const matchText = line.slice(prop.from, prop.to);
				const bracketStart = matchText.indexOf('[');

				blocks.push({
					blockId: prop.blockId,
					properties: prop.properties,
					line: i,
					context: context || '(start of line)',
					blockStart: prop.from,
					propsStart: prop.from + bracketStart,
					propsEnd: prop.to - 1,
				});
			}
		}

		return blocks;
	}

	private countKeys(blocks: PanelBlock[]): Record<string, number> {
		const counts: Record<string, number> = {};

		for (const block of blocks) {
			for (const prop of block.properties) {
				counts[prop.key] = (counts[prop.key] || 0) + 1;
			}
		}

		return counts;
	}

	private navigateToBlock(line: number) {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);

		if (view) {
			const editor = view.editor;
			editor.setCursor({line, ch: 0});
			editor.scrollIntoView(
				{from: {line, ch: 0}, to: {line, ch: 0}},
				true
			);
			editor.focus();
		}
	}

	private renderPropertyValue(
		container: HTMLElement,
		value: string,
		block: PanelBlock,
		key: string
	): void {
		if (!value) {
			const emptySpan = container.createEl('span', {
				text: '(empty)',
				cls: 'block-properties-panel-value is-empty',
			});
			emptySpan.addEventListener('click', () => {
				this.startEditingValue(container, block, key, value);
			});
			return;
		}

		const linkPositions = getLinkPositions(value);

		if (linkPositions.length === 0) {
			// No links, render as plain text (clickable to edit)
			const valueSpan = container.createEl('span', {
				text: value,
				cls: 'block-properties-panel-value',
			});
			valueSpan.addEventListener('click', () => {
				this.startEditingValue(container, block, key, value);
			});
			return;
		}

		// Render value with clickable links
		const valueEl = container.createEl('span', {
			cls: 'block-properties-panel-value block-properties-panel-value-with-links',
		});

		let lastIndex = 0;
		for (const pos of linkPositions) {
			// Text before link
			if (pos.from > lastIndex) {
				const textSpan = valueEl.createEl('span', {
					text: value.slice(lastIndex, pos.from),
				});
				textSpan.addEventListener('click', () => {
					this.startEditingValue(container, block, key, value);
				});
			}

			// Clickable link
			const linkEl = valueEl.createEl('a', {
				text: pos.link.alias || pos.link.target,
				cls: `block-properties-panel-link-value block-properties-link-${pos.link.type}`,
			});

			linkEl.addEventListener('click', async (e) => {
				e.stopPropagation();
				const sourcePath = this.currentFile?.path || '';
				const success = await navigateToLink(
					this.app,
					pos.link,
					sourcePath,
					this.currentFile || undefined
				);
				if (!success) {
					new Notice(`Could not find ${pos.link.type === 'note' ? 'note' : 'block'}: ${pos.link.target}`);
				}
			});

			lastIndex = pos.to;
		}

		// Text after last link
		if (lastIndex < value.length) {
			const textSpan = valueEl.createEl('span', {
				text: value.slice(lastIndex),
			});
			textSpan.addEventListener('click', () => {
				this.startEditingValue(container, block, key, value);
			});
		}

		// Edit icon for the whole value
		const editIcon = valueEl.createEl('span', {
			text: ' \u270e',
			cls: 'block-properties-panel-edit-icon',
		});
		editIcon.addEventListener('click', () => {
			this.startEditingValue(container, block, key, value);
		});
	}

	private async renderBacklinks(
		container: HTMLElement,
		blocks: PanelBlock[]
	): Promise<void> {
		const backlinkIndex = this.plugin.getBacklinkIndex();
		if (!backlinkIndex) return;

		// Collect all backlinks for blocks in this file
		const allBacklinks: Array<{targetId: string; entries: BacklinkEntry[]}> = [];

		for (const block of blocks) {
			const entries = backlinkIndex.getBacklinksForBlock(block.blockId);
			if (entries.length > 0) {
				allBacklinks.push({targetId: `^${block.blockId}`, entries});
			}
		}

		if (allBacklinks.length === 0) return;

		const section = container.createEl('div', {
			cls: 'block-properties-panel-backlinks',
		});

		section.createEl('h5', {text: 'Referenced by'});

		for (const {targetId, entries} of allBacklinks) {
			const targetHeader = section.createEl('div', {
				cls: 'block-properties-panel-backlinks-target',
			});
			targetHeader.createEl('span', {
				text: targetId,
				cls: 'block-properties-panel-backlinks-target-id',
			});

			const list = section.createEl('div', {
				cls: 'block-properties-panel-backlinks-list',
			});

			for (const entry of entries) {
				const item = list.createEl('div', {
					cls: 'block-properties-panel-backlinks-item',
				});

				const file = this.app.vault.getAbstractFileByPath(entry.sourceFile);
				const displayName = file instanceof TFile
					? `${file.basename} → ^${entry.sourceBlockId}`
					: `${entry.sourceFile} → ^${entry.sourceBlockId}`;

				const link = item.createEl('a', {
					text: displayName,
					cls: 'block-properties-panel-backlinks-link',
				});

				link.addEventListener('click', async () => {
					if (file instanceof TFile) {
						const leaf = this.app.workspace.getLeaf();
						await leaf.openFile(file);

						// Navigate to line
						setTimeout(() => {
							const view = this.app.workspace.getActiveViewOfType(MarkdownView);
							if (view) {
								const editor = view.editor;
								editor.setCursor({line: entry.line, ch: 0});
								editor.scrollIntoView(
									{from: {line: entry.line, ch: 0}, to: {line: entry.line, ch: 0}},
									true
								);
							}
						}, 100);
					}
				});

				item.createEl('span', {
					text: ` (${entry.key})`,
					cls: 'block-properties-panel-backlinks-key',
				});
			}
		}
	}

	private startEditingValue(
		container: HTMLElement,
		block: PanelBlock,
		key: string,
		currentValue: string
	): void {
		container.empty();

		const input = container.createEl('input', {
			type: 'text',
			value: currentValue,
			cls: 'block-properties-panel-edit-input',
		});

		const dropdown = container.createEl('div', {
			cls: 'block-properties-panel-dropdown',
		});

		this.populateValueDropdown(dropdown, key, input);

		input.focus();
		input.select();

		input.addEventListener('input', () => {
			this.populateValueDropdown(dropdown, key, input);
		});

		const save = async () => {
			const newValue = input.value.trim();
			await this.updateProperty(block, key, newValue);
		};

		input.addEventListener('blur', () => {
			setTimeout(() => {
				if (!container.contains(document.activeElement)) {
					save();
				}
			}, 150);
		});

		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				save();
			} else if (e.key === 'Escape') {
				this.renderPanel();
			}
		});
	}

	private populateValueDropdown(
		dropdown: HTMLElement,
		key: string,
		input: HTMLInputElement
	): void {
		dropdown.empty();

		const suggest = this.plugin.getSuggest();
		if (!suggest) {
			dropdown.hide();
			return;
		}

		const values = suggest.getValuesForKey(key);
		const query = input.value.toLowerCase();

		const filtered = Array.from(values.entries())
			.filter(([value]) => value.toLowerCase().includes(query))
			.sort((a, b) => b[1] - a[1])
			.slice(0, 5);

		if (filtered.length === 0) {
			dropdown.hide();
			return;
		}

		dropdown.show();

		for (const [value, count] of filtered) {
			const item = dropdown.createEl('div', {
				cls: 'block-properties-panel-dropdown-item',
			});

			item.createEl('span', {text: value});
			item.createEl('span', {
				text: `${count}`,
				cls: 'block-properties-panel-dropdown-count',
			});

			item.addEventListener('click', () => {
				input.value = value;
				input.focus();
				dropdown.hide();
			});
		}
	}

	private startAddingProperty(
		container: HTMLElement,
		block: PanelBlock,
		addBtn: HTMLElement
	): void {
		addBtn.remove();

		const newPropEl = container.createEl('div', {
			cls: 'block-properties-panel-prop block-properties-panel-new-prop',
		});

		const keyInput = newPropEl.createEl('input', {
			type: 'text',
			placeholder: 'key',
			cls: 'block-properties-panel-edit-input block-properties-panel-key-input',
		});

		newPropEl.createEl('span', {text: ':'});

		const valueInput = newPropEl.createEl('input', {
			type: 'text',
			placeholder: 'value',
			cls: 'block-properties-panel-edit-input',
		});

		const saveBtn = newPropEl.createEl('button', {
			text: '\u2713',
			cls: 'block-properties-panel-save-btn',
		});

		const cancelBtn = newPropEl.createEl('button', {
			text: '\u00d7',
			cls: 'block-properties-panel-cancel-btn',
		});

		keyInput.focus();

		const keyDropdown = newPropEl.createEl('div', {
			cls: 'block-properties-panel-dropdown block-properties-panel-key-dropdown',
		});

		keyInput.addEventListener('input', () => {
			this.populateKeyDropdown(keyDropdown, keyInput, valueInput);
		});

		saveBtn.addEventListener('click', async () => {
			const key = keyInput.value.trim();
			const value = valueInput.value.trim();

			if (!key) return;

			await this.addProperty(block, key, value);
		});

		cancelBtn.addEventListener('click', () => {
			this.renderPanel();
		});

		valueInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				saveBtn.click();
			} else if (e.key === 'Escape') {
				cancelBtn.click();
			}
		});

		keyInput.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') {
				cancelBtn.click();
			}
		});
	}

	private populateKeyDropdown(
		dropdown: HTMLElement,
		keyInput: HTMLInputElement,
		valueInput: HTMLInputElement
	): void {
		dropdown.empty();

		const suggest = this.plugin.getSuggest();
		if (!suggest) {
			dropdown.hide();
			return;
		}

		const keys = suggest.getKeys();
		const query = keyInput.value.toLowerCase();

		const filtered = Array.from(keys.entries())
			.filter(([key]) => key.toLowerCase().includes(query))
			.sort((a, b) => b[1] - a[1])
			.slice(0, 5);

		if (filtered.length === 0) {
			dropdown.hide();
			return;
		}

		dropdown.show();

		for (const [key, count] of filtered) {
			const item = dropdown.createEl('div', {
				cls: 'block-properties-panel-dropdown-item',
			});

			item.createEl('span', {text: key});
			item.createEl('span', {
				text: `${count}`,
				cls: 'block-properties-panel-dropdown-count',
			});

			item.addEventListener('click', () => {
				keyInput.value = key;
				valueInput.focus();
				dropdown.hide();
			});
		}
	}

	private async updateProperty(
		block: PanelBlock,
		key: string,
		newValue: string
	): Promise<void> {
		if (!this.currentFile) return;

		try {
			const content = await this.app.vault.read(this.currentFile);
			const lines = content.split('\n');
			const line = lines[block.line];
			if (!line) return;

			const updatedProps = block.properties.map((p) =>
				p.key === key ? {key, value: newValue} : p
			);

			const newPropsStr = updatedProps
				.map((p) => `${p.key}: ${p.value}`)
				.join(', ');

			const beforeProps = line.slice(0, block.propsStart);
			const afterProps = line.slice(block.propsEnd + 1);
			const newLine = `${beforeProps}[${newPropsStr}]${afterProps}`;

			lines[block.line] = newLine;
			await this.app.vault.modify(this.currentFile, lines.join('\n'));

			this.renderPanel();
		} catch (e) {
			new Notice('Failed to update property');
		}
	}

	private async addProperty(
		block: PanelBlock,
		key: string,
		value: string
	): Promise<void> {
		if (!this.currentFile) return;

		if (block.properties.find((p) => p.key === key)) {
			await this.updateProperty(block, key, value);
			return;
		}

		try {
			const content = await this.app.vault.read(this.currentFile);
			const lines = content.split('\n');
			const line = lines[block.line];
			if (!line) return;

			const updatedProps = [...block.properties, {key, value}];

			const newPropsStr = updatedProps
				.map((p) => `${p.key}: ${p.value}`)
				.join(', ');

			const beforeProps = line.slice(0, block.propsStart);
			const afterProps = line.slice(block.propsEnd + 1);
			const newLine = `${beforeProps}[${newPropsStr}]${afterProps}`;

			lines[block.line] = newLine;
			await this.app.vault.modify(this.currentFile, lines.join('\n'));

			this.renderPanel();
		} catch (e) {
			new Notice('Failed to add property');
		}
	}

	private async deleteProperty(block: PanelBlock, key: string): Promise<void> {
		if (!this.currentFile) return;

		try {
			const content = await this.app.vault.read(this.currentFile);
			const lines = content.split('\n');
			const line = lines[block.line];
			if (!line) return;

			const updatedProps = block.properties.filter((p) => p.key !== key);

			if (updatedProps.length === 0) {
				// Remove entire block properties syntax, keep ^blockId
				const beforeBlock = line.slice(0, block.blockStart);
				const afterProps = line.slice(block.propsEnd + 1);
				const blockIdMatch = line.slice(block.blockStart).match(/^\^[\w-]+/);
				const newLine = `${beforeBlock}${blockIdMatch?.[0] || ''}${afterProps}`;
				lines[block.line] = newLine;
			} else {
				const newPropsStr = updatedProps
					.map((p) => `${p.key}: ${p.value}`)
					.join(', ');

				const beforeProps = line.slice(0, block.propsStart);
				const afterProps = line.slice(block.propsEnd + 1);
				const newLine = `${beforeProps}[${newPropsStr}]${afterProps}`;
				lines[block.line] = newLine;
			}

			await this.app.vault.modify(this.currentFile, lines.join('\n'));

			this.renderPanel();
		} catch (e) {
			new Notice('Failed to delete property');
		}
	}
}
