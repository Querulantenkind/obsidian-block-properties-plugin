import {RangeSetBuilder} from '@codemirror/state';
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
import {parseBlockProperties} from './parser';
import type {DisplayMode} from './types';

const propertyDecoration = Decoration.mark({
	class: 'block-property',
});

class BadgeWidget extends WidgetType {
	constructor(
		private blockId: string,
		private properties: {key: string; value: string}[]
	) {
		super();
	}

	toDOM() {
		const badge = document.createElement('span');
		badge.className = 'block-property-badge';
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
			JSON.stringify(this.properties) === JSON.stringify(other.properties)
		);
	}
}

function createViewPlugin(displayMode: DisplayMode) {
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

			for (const {from, to} of view.visibleRanges) {
				const text = view.state.doc.sliceString(from, to);
				const blockProps = parseBlockProperties(text, from);

				for (const prop of blockProps) {
					const fullText = view.state.doc.sliceString(prop.from, prop.to);
					const bracketStart = fullText.indexOf('[');

					if (bracketStart !== -1) {
						const decorFrom = prop.from + bracketStart;
						const decorTo = prop.to;

						if (displayMode === 'badge') {
							// Replace with badge widget
							const widget = new BadgeWidget(prop.blockId, prop.properties);
							builder.add(
								decorFrom,
								decorTo,
								Decoration.replace({widget})
							);
						} else {
							// Inline mode - just style the text
							builder.add(decorFrom, decorTo, propertyDecoration);
						}
					}
				}
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

export function createBlockPropertiesExtension(displayMode: DisplayMode) {
	return [createViewPlugin(displayMode), blockPropertiesTooltip];
}
