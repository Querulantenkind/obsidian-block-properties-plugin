import {ItemView, TFile, WorkspaceLeaf} from 'obsidian';
import {Network, DataSet} from 'vis-network/standalone';
import type BlockPropertiesPlugin from './main';
import {parseBlockProperties} from './parser';

export const GRAPH_VIEW_TYPE = 'block-properties-graph';

interface GraphNode {
	id: string;
	label: string;
	file: string;
	title?: string;
	color?: string;
}

interface GraphEdge {
	id: string;
	from: string;
	to: string;
	label: string;
}

interface BlockInfo {
	blockId: string;
	file: TFile;
	properties: {key: string; value: string}[];
	line: number;
}

export class BlockGraphView extends ItemView {
	plugin: BlockPropertiesPlugin;
	private network: Network | null = null;
	private container: HTMLElement | null = null;
	private blockIndex: Map<string, BlockInfo> = new Map();

	constructor(leaf: WorkspaceLeaf, plugin: BlockPropertiesPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return GRAPH_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Block Graph';
	}

	getIcon(): string {
		return 'git-fork';
	}

	async onOpen() {
		await this.renderGraph();
	}

	async onClose() {
		if (this.network) {
			this.network.destroy();
			this.network = null;
		}
	}

	async refresh() {
		await this.renderGraph();
	}

	private async renderGraph() {
		const {contentEl} = this;
		contentEl.empty();
		contentEl.addClass('block-graph-view');

		// Header with controls
		const header = contentEl.createEl('div', {cls: 'block-graph-header'});
		const titleRow = header.createEl('div', {cls: 'block-graph-title-row'});
		titleRow.createEl('h4', {text: 'Block Graph'});

		const refreshBtn = titleRow.createEl('button', {
			cls: 'block-graph-refresh',
			attr: {'aria-label': 'Refresh graph'},
		});
		refreshBtn.createEl('span', {text: '↻'});
		refreshBtn.addEventListener('click', () => this.refresh());

		// Graph container
		this.container = contentEl.createEl('div', {cls: 'block-graph-container'});

		// Build graph data
		const {nodes, edges} = await this.buildGraphData();

		if (nodes.length === 0) {
			this.container.createEl('div', {
				text: 'No block relationships found.',
				cls: 'block-graph-empty',
			});
			this.container.createEl('div', {
				text: 'Link blocks using properties like: ^task-1 [blocked-by: ^task-2]',
				cls: 'block-graph-empty-hint',
			});
			return;
		}

		// Create vis-network datasets
		const nodesDataSet = new DataSet(nodes);
		const edgesDataSet = new DataSet(edges);

		const data = {nodes: nodesDataSet, edges: edgesDataSet};

		// Obsidian theme detection
		const isDark = document.body.classList.contains('theme-dark');
		const nodeColor = isDark ? '#7c8492' : '#9E9E9E';
		const fontColor = isDark ? '#dcddde' : '#1a1a1a';
		const edgeColor = isDark ? '#5c6370' : '#b0b0b0';

		const options = {
			nodes: {
				shape: 'box',
				margin: {top: 10, right: 10, bottom: 10, left: 10},
				font: {
					size: 13,
					color: fontColor,
					face: 'var(--font-interface)',
				},
				color: {
					background: nodeColor,
					border: nodeColor,
					highlight: {
						background: isDark ? '#8b92a0' : '#757575',
						border: isDark ? '#a0a8b8' : '#616161',
					},
					hover: {
						background: isDark ? '#8b92a0' : '#bdbdbd',
						border: isDark ? '#a0a8b8' : '#9e9e9e',
					},
				},
				borderWidth: 1,
				borderWidthSelected: 2,
			},
			edges: {
				arrows: {to: {enabled: true, scaleFactor: 0.8}},
				font: {
					size: 11,
					color: fontColor,
					strokeWidth: 3,
					strokeColor: isDark ? '#1e1e1e' : '#ffffff',
					align: 'middle',
				},
				color: {
					color: edgeColor,
					highlight: isDark ? '#8b92a0' : '#757575',
					hover: isDark ? '#7c8492' : '#9e9e9e',
				},
				smooth: {
					enabled: true,
					type: 'cubicBezier',
					forceDirection: 'none',
					roundness: 0.4,
				},
			},
			physics: {
				enabled: true,
				solver: 'forceAtlas2Based',
				forceAtlas2Based: {
					gravitationalConstant: -50,
					centralGravity: 0.01,
					springLength: 150,
					springConstant: 0.08,
					damping: 0.4,
				},
				stabilization: {
					enabled: true,
					iterations: 150,
					updateInterval: 25,
				},
			},
			interaction: {
				hover: true,
				tooltipDelay: 200,
				zoomView: true,
				dragView: true,
			},
			layout: {
				improvedLayout: true,
			},
		};

		this.network = new Network(this.container, data, options);

		// Double-click handler for navigation
		this.network.on('doubleClick', (params) => {
			if (params.nodes.length > 0) {
				const nodeId = params.nodes[0] as string;
				this.navigateToBlock(nodeId);
			}
		});

		// Show hint
		const hint = contentEl.createEl('div', {
			cls: 'block-graph-hint',
			text: 'Double-click a node to navigate to that block',
		});
	}

	private async buildGraphData(): Promise<{nodes: GraphNode[]; edges: GraphEdge[]}> {
		const nodes: GraphNode[] = [];
		const edges: GraphEdge[] = [];
		const nodeIds = new Set<string>();
		const edgeIds = new Set<string>();

		// First pass: index all blocks with their properties
		this.blockIndex.clear();
		const files = this.app.vault.getMarkdownFiles();

		for (const file of files) {
			const content = await this.app.vault.cachedRead(file);
			const lines = content.split('\n');
			const blocks = parseBlockProperties(content);

			for (const block of blocks) {
				// Find line number for this block
				const blockPattern = new RegExp(`\\^${block.blockId}(?:\\s|\\[|$)`);
				let lineNum = 0;
				for (let i = 0; i < lines.length; i++) {
					if (blockPattern.test(lines[i] || '')) {
						lineNum = i;
						break;
					}
				}

				this.blockIndex.set(block.blockId, {
					blockId: block.blockId,
					file,
					properties: block.properties.map((p) => ({key: p.key, value: p.value})),
					line: lineNum,
				});
			}
		}

		// Second pass: build graph from block references in properties
		for (const [blockId, info] of this.blockIndex) {
			const nodeId = blockId;

			for (const prop of info.properties) {
				// Find block references in property value
				const blockRefs = this.extractBlockRefs(prop.value);

				for (const targetId of blockRefs) {
					// Create edge
					const edgeId = `${nodeId}-${prop.key}-${targetId}`;
					if (!edgeIds.has(edgeId)) {
						edgeIds.add(edgeId);
						edges.push({
							id: edgeId,
							from: nodeId,
							to: targetId,
							label: prop.key,
						});
					}

					// Ensure source node exists
					if (!nodeIds.has(nodeId)) {
						nodeIds.add(nodeId);
						nodes.push(this.createNode(nodeId, info));
					}

					// Ensure target node exists
					if (!nodeIds.has(targetId)) {
						nodeIds.add(targetId);
						const targetInfo = this.blockIndex.get(targetId);
						if (targetInfo) {
							nodes.push(this.createNode(targetId, targetInfo));
						} else {
							// Orphan reference - block not found
							nodes.push({
								id: targetId,
								label: `^${targetId}`,
								file: '?',
								title: 'Block not found in vault',
								color: '#f44336',
							});
						}
					}
				}
			}
		}

		return {nodes, edges};
	}

	private extractBlockRefs(value: string): string[] {
		const refs: string[] = [];
		const regex = /\^([\w-]+)/g;
		let match: RegExpExecArray | null;

		while ((match = regex.exec(value)) !== null) {
			const id = match[1];
			if (id) {
				refs.push(id);
			}
		}

		return refs;
	}

	private createNode(id: string, info: BlockInfo): GraphNode {
		const statusProp = info.properties.find((p) => p.key === 'status');
		const color = statusProp ? this.getStatusColor(statusProp.value) : undefined;

		// Build tooltip
		const propsText = info.properties
			.map((p) => `${p.key}: ${p.value}`)
			.join('\n');
		const tooltip = `^${id}\nFile: ${info.file.basename}\n\n${propsText}`;

		return {
			id,
			label: `^${id}`,
			file: info.file.basename,
			title: tooltip,
			color,
		};
	}

	private getStatusColor(status: string): string | undefined {
		const isDark = document.body.classList.contains('theme-dark');

		switch (status.toLowerCase()) {
			case 'done':
			case 'complete':
			case 'completed':
				return isDark ? '#4CAF50' : '#66BB6A';
			case 'blocked':
			case 'failed':
				return isDark ? '#f44336' : '#EF5350';
			case 'in-progress':
			case 'active':
			case 'doing':
				return isDark ? '#2196F3' : '#42A5F5';
			case 'todo':
			case 'pending':
				return isDark ? '#FF9800' : '#FFA726';
			default:
				return undefined;
		}
	}

	private async navigateToBlock(nodeId: string) {
		const info = this.blockIndex.get(nodeId);
		if (!info) {
			return;
		}

		const leaf = this.app.workspace.getLeaf('tab');
		await leaf.openFile(info.file);

		// Scroll to line after file is loaded
		setTimeout(() => {
			const view = leaf.view;
			if (view.getViewType() === 'markdown') {
				const editor = (view as any).editor;
				if (editor) {
					editor.setCursor({line: info.line, ch: 0});
					editor.scrollIntoView(
						{
							from: {line: info.line, ch: 0},
							to: {line: info.line, ch: 0},
						},
						true
					);
				}
			}
		}, 100);
	}
}
