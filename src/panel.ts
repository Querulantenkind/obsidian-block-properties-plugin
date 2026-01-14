import {ItemView, TFile, WorkspaceLeaf} from 'obsidian';
import {parseBlockProperties} from './parser';
import type BlockPropertiesPlugin from './main';

export const PANEL_VIEW_TYPE = 'block-properties-panel';

interface PanelBlock {
	blockId: string;
	properties: {key: string; value: string}[];
	line: number;
	context: string;
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
		const container = this.containerEl.children[1];
		container.empty();
		container.addClass('block-properties-panel');

		const header = container.createEl('div', {
			cls: 'block-properties-panel-header',
		});

		if (!this.currentFile) {
			header.createEl('h4', {text: 'Block Properties'});
			container.createEl('p', {
				text: 'No file open',
				cls: 'block-properties-panel-empty',
			});
			return;
		}

		header.createEl('h4', {text: this.currentFile.basename});

		const content = await this.app.vault.cachedRead(this.currentFile);
		const blocks = this.extractBlocks(content);

		if (blocks.length === 0) {
			container.createEl('p', {
				text: 'No block properties found',
				cls: 'block-properties-panel-empty',
			});
			return;
		}

		const countEl = container.createEl('p', {
			cls: 'block-properties-panel-count',
		});
		countEl.textContent = `${blocks.length} block(s) with properties`;

		const list = container.createEl('div', {
			cls: 'block-properties-panel-list',
		});

		for (const block of blocks) {
			const item = list.createEl('div', {
				cls: 'block-properties-panel-item',
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

				propEl.createEl('span', {
					text: p.value,
					cls: 'block-properties-panel-value',
				});
			}
		}

		// Summary section
		const summary = container.createEl('div', {
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
			const props = parseBlockProperties(line);

			for (const prop of props) {
				const context = line.slice(0, prop.from).trim().slice(0, 40);
				blocks.push({
					blockId: prop.blockId,
					properties: prop.properties,
					line: i,
					context: context || '(start of line)',
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
		const view = this.app.workspace.getActiveViewOfType(
			require('obsidian').MarkdownView
		);

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
}
