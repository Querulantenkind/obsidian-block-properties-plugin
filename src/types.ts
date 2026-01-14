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

export type DisplayMode = 'inline' | 'badge';

export interface BlockPropertiesSettings {
	displayMode: DisplayMode;
	propertyColor: string;
	opacity: number;
}

export const DEFAULT_SETTINGS: BlockPropertiesSettings = {
	displayMode: 'inline',
	propertyColor: '#888888',
	opacity: 0.6,
};
