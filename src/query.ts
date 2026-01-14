import {App, MarkdownView, Modal, Setting, TFile} from 'obsidian';
import {parseBlockProperties} from './parser';

export interface QueryResult {
	file: TFile;
	line: number;
	blockId: string;
	properties: {key: string; value: string}[];
	context: string;
}

export class QueryModal extends Modal {
	private onSubmit: (key: string, value: string) => void;

	constructor(app: App, onSubmit: (key: string, value: string) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.addClass('block-properties-query-modal');

		contentEl.createEl('h2', {text: 'Query Block Properties'});

		let keyValue = '';
		let valueValue = '';

		new Setting(contentEl)
			.setName('Property key')
			.setDesc('e.g. "status", "priority", "version"')
			.addText((text) =>
				text
					.setPlaceholder('status')
					.onChange((value) => {
						keyValue = value;
					})
			);

		new Setting(contentEl)
			.setName('Property value (optional)')
			.setDesc('Leave empty to find all blocks with this key')
			.addText((text) =>
				text
					.setPlaceholder('draft')
					.onChange((value) => {
						valueValue = value;
					})
			);

		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText('Search')
				.setCta()
				.onClick(() => {
					this.close();
					this.onSubmit(keyValue, valueValue);
				})
		);
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

export class ResultsModal extends Modal {
	private results: QueryResult[];
	private query: {key: string; value: string};

	constructor(
		app: App,
		results: QueryResult[],
		query: {key: string; value: string}
	) {
		super(app);
		this.results = results;
		this.query = query;
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.addClass('block-properties-results-modal');

		const queryStr = this.query.value
			? `${this.query.key}: ${this.query.value}`
			: this.query.key;

		contentEl.createEl('h2', {text: `Results for "${queryStr}"`});
		contentEl.createEl('p', {
			text: `Found ${this.results.length} block(s)`,
			cls: 'block-properties-results-count',
		});

		if (this.results.length === 0) {
			contentEl.createEl('p', {
				text: 'No blocks found with matching properties.',
				cls: 'block-properties-no-results',
			});
			return;
		}

		const list = contentEl.createEl('div', {
			cls: 'block-properties-results-list',
		});

		for (const result of this.results) {
			const item = list.createEl('div', {
				cls: 'block-properties-result-item',
			});

			const header = item.createEl('div', {
				cls: 'block-properties-result-header',
			});

			const link = header.createEl('a', {
				text: `${result.file.basename} → ^${result.blockId}`,
				cls: 'block-properties-result-link',
			});

			link.addEventListener('click', async (e) => {
				e.preventDefault();
				this.close();

				// Open file and navigate to line
				const leaf = this.app.workspace.getLeaf();
				await leaf.openFile(result.file);

				// Navigate to the block
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (view) {
					const editor = view.editor;
					editor.setCursor({line: result.line, ch: 0});
					editor.scrollIntoView(
						{from: {line: result.line, ch: 0}, to: {line: result.line, ch: 0}},
						true
					);
				}
			});

			const props = item.createEl('div', {
				cls: 'block-properties-result-props',
			});

			for (const p of result.properties) {
				const isMatch =
					p.key === this.query.key &&
					(!this.query.value || p.value === this.query.value);

				props.createEl('span', {
					text: `${p.key}: ${p.value}`,
					cls: `block-properties-result-prop ${isMatch ? 'is-match' : ''}`,
				});
			}

			if (result.context) {
				item.createEl('div', {
					text: result.context,
					cls: 'block-properties-result-context',
				});
			}
		}
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

export async function searchBlockProperties(
	app: App,
	key: string,
	value?: string
): Promise<QueryResult[]> {
	const results: QueryResult[] = [];
	const files = app.vault.getMarkdownFiles();

	for (const file of files) {
		const content = await app.vault.cachedRead(file);
		const lines = content.split('\n');

		for (let lineNum = 0; lineNum < lines.length; lineNum++) {
			const line = lines[lineNum];
			if (!line) continue;

			const blockProps = parseBlockProperties(line);

			for (const prop of blockProps) {
				// Check if any property matches the query
				const matchingProp = prop.properties.find(
					(p) => p.key === key && (!value || p.value === value)
				);

				if (matchingProp) {
					results.push({
						file,
						line: lineNum,
						blockId: prop.blockId,
						properties: prop.properties,
						context: line.slice(0, prop.from).trim().slice(0, 60),
					});
				}
			}
		}
	}

	return results;
}
