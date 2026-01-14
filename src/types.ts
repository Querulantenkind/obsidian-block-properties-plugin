// Link types for property values
export type LinkType = 'note' | 'block';

export interface ParsedLink {
	type: LinkType;
	raw: string;      // Original text: "[[Note]]" or "^block-id"
	target: string;   // Resolved: "Note" or "block-id"
	alias?: string;   // For [[Note|alias]]
}

export interface ParsedValue {
	raw: string;
	links: ParsedLink[];
}

export interface BlockProperty {
	key: string;
	value: string;
	parsedValue?: ParsedValue;
}

export interface BlockProperties {
	blockId: string;
	properties: BlockProperty[];
	from: number;
	to: number;
}

// Backlink tracking
export interface BacklinkEntry {
	sourceFile: string;
	sourceBlockId: string;
	key: string;
	line: number;
}

export interface PropertyTemplate {
	name: string;
	properties: BlockProperty[];
}

export type DisplayMode = 'inline' | 'badge';

// Conditional styling
export type StylingTarget = 'property' | 'line';

export interface StyleRule {
	key: string;
	value: string;      // Exact match or "*" for any value
	className: string;  // Custom class to apply
}

export interface BlockPropertiesSettings {
	displayMode: DisplayMode;
	propertyColor: string;
	opacity: number;
	templates: PropertyTemplate[];
	autoExpandPresets: boolean;
	enableLinkedProperties: boolean;
	showBacklinksInPanel: boolean;
	enableConditionalStyling: boolean;
	stylingTarget: StylingTarget;
	usePresetStyles: boolean;
	customStyleRules: StyleRule[];
}

export const DEFAULT_SETTINGS: BlockPropertiesSettings = {
	displayMode: 'inline',
	propertyColor: '#888888',
	opacity: 0.6,
	templates: [
		{
			name: 'task',
			properties: [
				{key: 'status', value: 'todo'},
				{key: 'priority', value: 'medium'},
				{key: 'assignee', value: ''},
			],
		},
	],
	autoExpandPresets: true,
	enableLinkedProperties: true,
	showBacklinksInPanel: true,
	enableConditionalStyling: true,
	stylingTarget: 'property',
	usePresetStyles: true,
	customStyleRules: [],
};
