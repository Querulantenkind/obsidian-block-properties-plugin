import {Extension, RangeSetBuilder} from '@codemirror/state';
import {
	Decoration,
	DecorationSet,
	EditorView,
	hoverTooltip,
	PluginValue,
	Tooltip,
	ViewPlugin,
	ViewUpdate,
	WidgetType,
} from '@codemirror/view';
import {App} from 'obsidian';
import {parseBlockProperties} from './parser';
import {getLinkPositions} from './link-parser';
import {navigateToLink} from './link-resolver';
import {getConditionalClasses} from './conditional-styles';
import type {BlockPropertiesSettings, DisplayMode, ParsedLink} from './types';

class BadgeWidget extends WidgetType {
	constructor(
		private blockId: string,
		private properties: {key: string; value: string}[],
		private conditionalClasses: string[] = []
	) {
		super();
	}

	toDOM() {
		const badge = document.createElement('span');
		badge.className = ['block-property-badge', ...this.conditionalClasses].join(' ');
		badge.setAttribute('data-block-id', this.blockId);
		badge.setAttribute('data-properties', JSON.stringify(this.properties));

		// Show property count
		const count = this.properties.length;
		badge.textContent = `${count}`;
		badge.title = this.properties.map((p) => `${p.key}: ${p.value}`).join(', ');

		return badge;
	}

	eq(other: BadgeWidget) {
		return (
			this.blockId === other.blockId &&
			JSON.stringify(this.properties) === JSON.stringify(other.properties) &&
			JSON.stringify(this.conditionalClasses) === JSON.stringify(other.conditionalClasses)
		);
	}
}

function createViewPlugin(displayMode: DisplayMode, settings: BlockPropertiesSettings) {
	class BlockPropertiesViewPlugin implements PluginValue {
		decorations: DecorationSet;

		constructor(view: EditorView) {
			this.decorations = this.buildDecorations(view);
		}

		update(update: ViewUpdate) {
			if (update.docChanged || update.viewportChanged) {
				this.decorations = this.buildDecorations(update.view);
			}
		}

		destroy() {}

		private buildDecorations(view: EditorView): DecorationSet {
			const builder = new RangeSetBuilder<Decoration>();
			// Collect decorations to sort later (CodeMirror requires sorted ranges)
			const decorations: {from: number; to: number; decoration: Decoration}[] = [];

			for (const {from, to} of view.visibleRanges) {
				const text = view.state.doc.sliceString(from, to);
				const blockProps = parseBlockProperties(text, from);

				for (const prop of blockProps) {
					const fullText = view.state.doc.sliceString(prop.from, prop.to);
					const bracketStart = fullText.indexOf('[');

					if (bracketStart !== -1) {
						const decorFrom = prop.from + bracketStart;
						const decorTo = prop.to;

						// Get conditional classes
						const conditionalClasses = getConditionalClasses(prop.properties, settings);

						// Add line decoration if styling target is 'line'
						if (settings.enableConditionalStyling && settings.stylingTarget === 'line' && conditionalClasses.length > 0) {
							const line = view.state.doc.lineAt(prop.from);
							decorations.push({
								from: line.from,
								to: line.from,
								decoration: Decoration.line({
									class: ['bp-styled-line', ...conditionalClasses].join(' ')
								})
							});
						}

						if (displayMode === 'badge') {
							// Replace with badge widget
							const widget = new BadgeWidget(prop.blockId, prop.properties, conditionalClasses);
							decorations.push({
								from: decorFrom,
								to: decorTo,
								decoration: Decoration.replace({widget})
							});
						} else {
							// Inline mode - style the text with conditional classes
							const classes = ['block-property', ...conditionalClasses];
							decorations.push({
								from: decorFrom,
								to: decorTo,
								decoration: Decoration.mark({class: classes.join(' ')})
							});
						}
					}
				}
			}

			// Sort decorations by position (required by CodeMirror)
			decorations.sort((a, b) => a.from - b.from || a.to - b.to);

			for (const d of decorations) {
				builder.add(d.from, d.to, d.decoration);
			}

			return builder.finish();
		}
	}

	return ViewPlugin.fromClass(BlockPropertiesViewPlugin, {
		decorations: (v) => v.decorations,
	});
}

const blockPropertiesTooltip = hoverTooltip(
	(view: EditorView, pos: number): Tooltip | null => {
		const line = view.state.doc.lineAt(pos);
		const lineText = line.text;
		const lineStart = line.from;

		const blockProps = parseBlockProperties(lineText, lineStart);

		for (const prop of blockProps) {
			const fullText = view.state.doc.sliceString(prop.from, prop.to);
			const bracketStart = fullText.indexOf('[');

			if (bracketStart !== -1) {
				const tooltipFrom = prop.from + bracketStart;
				const tooltipTo = prop.to;

				if (pos >= tooltipFrom && pos <= tooltipTo) {
					return {
						pos: tooltipFrom,
						above: true,
						create() {
							const dom = document.createElement('div');
							dom.className = 'block-properties-tooltip';

							const header = document.createElement('div');
							header.className = 'block-properties-tooltip-header';
							header.textContent = `^${prop.blockId}`;
							dom.appendChild(header);

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

							dom.appendChild(list);
							return {dom};
						},
					};
				}
			}
		}

		return null;
	}
);

// Link decoration for clickable links inside properties
const linkDecoration = Decoration.mark({
	class: 'block-property-link',
});

// Store link positions for click handling
interface LinkPosition {
	from: number;
	to: number;
	link: ParsedLink;
}

// Global storage for link positions (per editor view)
const linkPositionsByView = new WeakMap<EditorView, LinkPosition[]>();

function createLinkViewPlugin() {
	class LinkViewPlugin implements PluginValue {
		decorations: DecorationSet;
		linkPositions: LinkPosition[] = [];

		constructor(view: EditorView) {
			const result = this.buildLinkDecorations(view);
			this.decorations = result.decorations;
			this.linkPositions = result.positions;
			linkPositionsByView.set(view, this.linkPositions);
		}

		update(update: ViewUpdate) {
			if (update.docChanged || update.viewportChanged) {
				const result = this.buildLinkDecorations(update.view);
				this.decorations = result.decorations;
				this.linkPositions = result.positions;
				linkPositionsByView.set(update.view, this.linkPositions);
			}
		}

		destroy() {}

		private buildLinkDecorations(view: EditorView): {
			decorations: DecorationSet;
			positions: LinkPosition[];
		} {
			const builder = new RangeSetBuilder<Decoration>();
			const positions: LinkPosition[] = [];

			for (const {from, to} of view.visibleRanges) {
				const text = view.state.doc.sliceString(from, to);
				const blockProps = parseBlockProperties(text, from);

				for (const prop of blockProps) {
					const fullText = view.state.doc.sliceString(prop.from, prop.to);
					const bracketStart = fullText.indexOf('[');
					const bracketEnd = fullText.lastIndexOf(']');

					if (bracketStart === -1 || bracketEnd === -1) continue;

					// Get the properties string content (between brackets)
					const propsContent = fullText.slice(bracketStart + 1, bracketEnd);
					const propsStartPos = prop.from + bracketStart + 1;

					// Find links in each property value
					let currentOffset = 0;
					for (const p of prop.properties) {
						// Find position of this key-value pair in propsContent
						const pairStr = `${p.key}: ${p.value}`;
						const pairIndex = propsContent.indexOf(pairStr, currentOffset);
						if (pairIndex === -1) continue;

						const valueStart = pairIndex + p.key.length + 2; // +2 for ": "
						const valueAbsStart = propsStartPos + valueStart;

						// Get link positions within this value
						const linkPos = getLinkPositions(p.value);
						for (const lp of linkPos) {
							const absoluteFrom = valueAbsStart + lp.from;
							const absoluteTo = valueAbsStart + lp.to;

							builder.add(absoluteFrom, absoluteTo, linkDecoration);
							positions.push({
								from: absoluteFrom,
								to: absoluteTo,
								link: lp.link,
							});
						}

						currentOffset = pairIndex + pairStr.length;
					}
				}
			}

			return {
				decorations: builder.finish(),
				positions,
			};
		}
	}

	return ViewPlugin.fromClass(LinkViewPlugin, {
		decorations: (v) => v.decorations,
	});
}

function createLinkClickHandler(app: App) {
	return EditorView.domEventHandlers({
		click: (event, view) => {
			// Check for Cmd (Mac) or Ctrl (Windows/Linux)
			if (!event.metaKey && !event.ctrlKey) return false;

			const pos = view.posAtCoords({x: event.clientX, y: event.clientY});
			if (pos === null) return false;

			const linkPositions = linkPositionsByView.get(view);
			if (!linkPositions) return false;

			// Find if click is on a link
			for (const lp of linkPositions) {
				if (pos >= lp.from && pos <= lp.to) {
					event.preventDefault();

					// Get current file path for link resolution
					const activeFile = app.workspace.getActiveFile();
					const sourcePath = activeFile?.path || '';

					navigateToLink(app, lp.link, sourcePath, activeFile || undefined);
					return true;
				}
			}

			return false;
		},
	});
}

export function createBlockPropertiesExtension(
	displayMode: DisplayMode,
	settings: BlockPropertiesSettings,
	app?: App
) {
	const extensions: Extension[] = [
		createViewPlugin(displayMode, settings),
		blockPropertiesTooltip,
	];

	// Add link decorations and click handler if app is provided
	if (app) {
		extensions.push(createLinkViewPlugin());
		extensions.push(createLinkClickHandler(app));
	}

	return extensions;
}
