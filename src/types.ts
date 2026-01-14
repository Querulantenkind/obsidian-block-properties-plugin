export interface BlockProperty {
	key: string;
	value: string;
}

export interface BlockProperties {
	blockId: string;
	properties: BlockProperty[];
	from: number;
	to: number;
}

export interface PropertyTemplate {
	name: string;
	properties: BlockProperty[];
}

export type DisplayMode = 'inline' | 'badge';

export interface BlockPropertiesSettings {
	displayMode: DisplayMode;
	propertyColor: string;
	opacity: number;
	templates: PropertyTemplate[];
	autoExpandPresets: boolean;
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
};
