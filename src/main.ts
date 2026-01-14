import {Editor, MarkdownPostProcessorContext, MarkdownView, Plugin, TFile, WorkspaceLeaf} from 'obsidian';
import {Extension} from '@codemirror/state';
import {createBlockPropertiesExtension} from './editor-extension';
import {PANEL_VIEW_TYPE, PropertyPanelView} from './panel';
import {GRAPH_VIEW_TYPE, BlockGraphView} from './graph-view';
import {parseBlockProperties} from './parser';
import {QueryModal, ResultsModal, searchBlockProperties} from './query';
import {BlockPropertiesSettingTab} from './settings';
import {BlockPropertiesSuggest} from './suggest';
import {BlockPropertiesSettings, DEFAULT_SETTINGS} from './types';
import {TemplatePickerModal} from './template-modal';
import {BacklinkIndexer} from './backlink-index';
import {getConditionalClasses} from './conditional-styles';
import {BulkEditModal} from './bulk-edit';

export default class BlockPropertiesPlugin extends Plugin {
	settings: BlockPropertiesSettings;
	private styleEl: HTMLStyleElement | null = null;
	private editorExtension: Extension[] = [];
	private suggest: BlockPropertiesSuggest | null = null;
	private backlinkIndex: BacklinkIndexer | null = null;

	async onload() {
		await this.loadSettings();

		// Register the CodeMirror extension
		this.editorExtension = createBlockPropertiesExtension(
			this.settings.displayMode,
			this.settings,
			this.settings.enableLinkedProperties ? this.app : undefined
		);
		this.registerEditorExtension(this.editorExtension);

		// Register the property panel view
		this.registerView(PANEL_VIEW_TYPE, (leaf) => new PropertyPanelView(leaf, this));

		// Register the block graph view
		this.registerView(GRAPH_VIEW_TYPE, (leaf) => new BlockGraphView(leaf, this));

		// Register autocomplete suggester
		this.suggest = new BlockPropertiesSuggest(this);
		this.registerEditorSuggest(this.suggest);

		// Add settings tab
		this.addSettingTab(new BlockPropertiesSettingTab(this.app, this));

		// Initialize backlink index if linked properties are enabled
		if (this.settings.enableLinkedProperties) {
			this.backlinkIndex = new BacklinkIndexer(this.app);
			this.backlinkIndex.registerFileEvents();

			// Build index after workspace is ready
			this.app.workspace.onLayoutReady(() => {
				this.backlinkIndex?.buildIndex();
			});
		}

		// Add command to insert block property template
		this.addCommand({
			id: 'insert-block-property',
			name: 'Insert block property',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const cursor = editor.getCursor();
				const line = editor.getLine(cursor.line);

				// Check if line already has a block ID
				if (line.includes('^')) {
					// Try to add properties to existing block ID
					const match = line.match(/\^([\w-]+)(?:\s*\[([^\]]*)\])?/);
					if (match) {
						const blockId = match[1];
						const existingProps = match[2] || '';
						const newProps = existingProps
							? `${existingProps}, key: value`
							: 'key: value';
						const replacement = `^${blockId} [${newProps}]`;
						const from = line.indexOf('^');
						editor.replaceRange(
							replacement,
							{line: cursor.line, ch: from},
							{line: cursor.line, ch: line.length}
						);
					}
				} else {
					// Insert new block ID with properties at end of line
					const insertion = ' ^block-id [key: value]';
					editor.replaceRange(insertion, {
						line: cursor.line,
						ch: line.length,
					});
				}
			},
		});

		// Add command to insert property template
		this.addCommand({
			id: 'insert-template',
			name: 'Insert property template',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				new TemplatePickerModal(
					this.app,
					this.settings.templates,
					(template) => {
						const cursor = editor.getCursor();
						const line = editor.getLine(cursor.line);

						const blockId = this.generateBlockId();
						const propsStr = template.properties
							.map((p) => `${p.key}: ${p.value}`)
							.join(', ');

						const insertion = ` ^${blockId} [${propsStr}]`;

						editor.replaceRange(insertion, {
							line: cursor.line,
							ch: line.length,
						});
					}
				).open();
			},
		});

		// Add command to query block properties
		this.addCommand({
			id: 'query-block-properties',
			name: 'Query block properties',
			callback: () => {
				new QueryModal(this.app, async (key, value) => {
					if (!key) return;

					const results = await searchBlockProperties(
						this.app,
						key,
						value || undefined
					);

					new ResultsModal(this.app, results, {key, value}).open();
				}).open();
			},
		});

		// Add command to open property panel
		this.addCommand({
			id: 'open-property-panel',
			name: 'Open property panel',
			callback: () => {
				this.activatePanel();
			},
		});

		// Add command to bulk edit properties
		this.addCommand({
			id: 'bulk-edit-properties',
			name: 'Bulk edit properties',
			callback: () => {
				new BulkEditModal(this.app, this).open();
			},
		});

		// Add command to open block graph
		this.addCommand({
			id: 'open-block-graph',
			name: 'Open block graph',
			callback: () => {
				this.activateGraphView();
			},
		});

		// Register Reading View post processor
		this.registerMarkdownPostProcessor(this.postProcessor.bind(this));

		// Listen for active file changes to update panel
		this.registerEvent(
			this.app.workspace.on('active-leaf-change', () => {
				this.updatePanel();
			})
		);

		this.registerEvent(
			this.app.workspace.on('editor-change', () => {
				this.updatePanel();
			})
		);

		// Apply initial styles
		this.updateStyles();
	}

	private async activatePanel() {
		const existing = this.app.workspace.getLeavesOfType(PANEL_VIEW_TYPE);
		const firstLeaf = existing[0];

		if (firstLeaf) {
			this.app.workspace.revealLeaf(firstLeaf);
			return;
		}

		const leaf = this.app.workspace.getRightLeaf(false);
		if (!leaf) return;

		await leaf.setViewState({type: PANEL_VIEW_TYPE, active: true});
		this.app.workspace.revealLeaf(leaf);
	}

	private async activateGraphView() {
		const existing = this.app.workspace.getLeavesOfType(GRAPH_VIEW_TYPE);
		const firstLeaf = existing[0];

		if (firstLeaf) {
			this.app.workspace.revealLeaf(firstLeaf);
			return;
		}

		const leaf = this.app.workspace.getLeaf('tab');
		await leaf.setViewState({type: GRAPH_VIEW_TYPE, active: true});
		this.app.workspace.revealLeaf(leaf);
	}

	private updatePanel() {
		const leaves = this.app.workspace.getLeavesOfType(PANEL_VIEW_TYPE);

		for (const leaf of leaves) {
			const view = leaf.view as PropertyPanelView;
			const activeFile = this.app.workspace.getActiveFile();
			view.updateForFile(activeFile);
		}
	}

	private postProcessor(el: HTMLElement, ctx: MarkdownPostProcessorContext) {
		// Process all text nodes to find block properties
		const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
		const nodesToProcess: {node: Text; props: ReturnType<typeof parseBlockProperties>}[] = [];

		let node: Text | null;
		while ((node = walker.nextNode() as Text | null)) {
			const text = node.textContent || '';
			const props = parseBlockProperties(text);
			if (props.length > 0) {
				nodesToProcess.push({node, props});
			}
		}

		// Process nodes in reverse to maintain positions
		for (const {node, props} of nodesToProcess.reverse()) {
			const text = node.textContent || '';

			for (const prop of props.reverse()) {
				// Find the full match in the text
				const fullMatch = text.slice(prop.from, prop.to);
				const bracketStart = fullMatch.indexOf('[');

				if (bracketStart === -1) continue;

				const beforeProps = text.slice(0, prop.from + bracketStart);
				const propsText = text.slice(prop.from + bracketStart, prop.to);
				const afterProps = text.slice(prop.to);

				// Get conditional classes
				const conditionalClasses = getConditionalClasses(prop.properties, this.settings);

				// Create wrapper span for properties
				const wrapper = document.createElement('span');
				wrapper.className = ['block-property', 'block-property-reading', ...conditionalClasses].join(' ');
				wrapper.textContent = propsText;
				wrapper.setAttribute('data-block-id', prop.blockId);
				wrapper.setAttribute(
					'data-properties',
					JSON.stringify(prop.properties)
				);

				// Create tooltip on hover
				wrapper.addEventListener('mouseenter', (e) => {
					this.showReadingTooltip(e.target as HTMLElement, prop);
				});
				wrapper.addEventListener('mouseleave', () => {
					this.hideReadingTooltip();
				});

				// Replace the text node
				const parent = node.parentNode;
				if (parent) {
					const beforeNode = document.createTextNode(beforeProps);
					const afterNode = document.createTextNode(afterProps);

					parent.insertBefore(beforeNode, node);
					parent.insertBefore(wrapper, node);
					parent.insertBefore(afterNode, node);
					parent.removeChild(node);

					// Apply line styling if target is 'line'
					if (this.settings.enableConditionalStyling && this.settings.stylingTarget === 'line' && conditionalClasses.length > 0) {
						const lineEl = wrapper.closest('p, li, div.markdown-preview-sizer > div');
						if (lineEl) {
							lineEl.classList.add('bp-styled-line', ...conditionalClasses);
						}
					}
				}
			}
		}
	}

	private readingTooltip: HTMLElement | null = null;

	private showReadingTooltip(
		target: HTMLElement,
		prop: ReturnType<typeof parseBlockProperties>[0]
	) {
		this.hideReadingTooltip();

		const tooltip = document.createElement('div');
		tooltip.className = 'block-properties-tooltip block-properties-reading-tooltip';

		const header = document.createElement('div');
		header.className = 'block-properties-tooltip-header';
		header.textContent = `^${prop.blockId}`;
		tooltip.appendChild(header);

		const list = document.createElement('div');
		list.className = 'block-properties-tooltip-list';

		for (const p of prop.properties) {
			const item = document.createElement('div');
			item.className = 'block-properties-tooltip-item';

			const key = document.createElement('span');
			key.className = 'block-properties-tooltip-key';
			key.textContent = p.key;

			const value = document.createElement('span');
			value.className = 'block-properties-tooltip-value';
			value.textContent = p.value;

			item.appendChild(key);
			item.appendChild(value);
			list.appendChild(item);
		}

		tooltip.appendChild(list);

		// Position tooltip
		const rect = target.getBoundingClientRect();
		tooltip.style.position = 'fixed';
		tooltip.style.left = `${rect.left}px`;
		tooltip.style.top = `${rect.top - 8}px`;
		tooltip.style.transform = 'translateY(-100%)';
		tooltip.style.zIndex = '1000';

		document.body.appendChild(tooltip);
		this.readingTooltip = tooltip;
	}

	private hideReadingTooltip() {
		if (this.readingTooltip) {
			this.readingTooltip.remove();
			this.readingTooltip = null;
		}
	}

	onunload() {
		if (this.styleEl) {
			this.styleEl.remove();
		}
		this.backlinkIndex?.unregisterFileEvents();
	}

	getBacklinkIndex(): BacklinkIndexer | null {
		return this.backlinkIndex;
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	updateStyles() {
		if (!this.styleEl) {
			this.styleEl = document.createElement('style');
			this.styleEl.id = 'block-properties-styles';
			document.head.appendChild(this.styleEl);
		}

		this.styleEl.textContent = `
			.block-property {
				color: ${this.settings.propertyColor};
				opacity: ${this.settings.opacity};
				font-size: 0.9em;
			}
		`;

		// Toggle preset styles class on body
		document.body.classList.toggle(
			'bp-use-presets',
			this.settings.enableConditionalStyling && this.settings.usePresetStyles
		);
	}

	refreshEditorExtension() {
		// Update the extension array contents
		const newExtension = createBlockPropertiesExtension(
			this.settings.displayMode,
			this.settings,
			this.settings.enableLinkedProperties ? this.app : undefined
		);
		this.editorExtension.length = 0;
		this.editorExtension.push(...newExtension);

		// Force refresh all markdown views
		this.app.workspace.updateOptions();
	}

	getSuggest(): BlockPropertiesSuggest | null {
		return this.suggest;
	}

	private generateBlockId(): string {
		const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
		let id = '';
		for (let i = 0; i < 6; i++) {
			id += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		return id;
	}
}
