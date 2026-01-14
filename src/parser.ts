import {BlockProperties, BlockProperty} from './types';
import {parseLinksInValue} from './link-parser';

// Matches: ^block-id [key: value, key2: value2]
// Group 1: block-id
// Group 2: properties string
const BLOCK_PROPS_REGEX = /\^([\w-]+)\s*\[([^\]]+)\]/g;

export function parseBlockProperties(text: string, offset = 0): BlockProperties[] {
	const results: BlockProperties[] = [];
	let match: RegExpExecArray | null;

	// Reset regex state
	BLOCK_PROPS_REGEX.lastIndex = 0;

	while ((match = BLOCK_PROPS_REGEX.exec(text)) !== null) {
		const blockId = match[1];
		const propsString = match[2];

		if (!blockId || !propsString) continue;

		const properties = parsePropertiesString(propsString);

		results.push({
			blockId,
			properties,
			from: offset + match.index,
			to: offset + match.index + match[0].length,
		});
	}

	return results;
}

function parsePropertiesString(propsString: string): BlockProperty[] {
	const properties: BlockProperty[] = [];
	const pairs = propsString.split(',');

	for (const pair of pairs) {
		const colonIndex = pair.indexOf(':');
		if (colonIndex === -1) continue;

		const key = pair.slice(0, colonIndex).trim();
		const value = pair.slice(colonIndex + 1).trim();

		if (key) {
			const parsedValue = parseLinksInValue(value);
			properties.push({key, value, parsedValue});
		}
	}

	return properties;
}

// Find the range of just the properties part [...]
export function getPropertiesRange(text: string, offset = 0): {from: number; to: number} | null {
	BLOCK_PROPS_REGEX.lastIndex = 0;
	const match = BLOCK_PROPS_REGEX.exec(text);

	if (!match) return null;

	const bracketStart = match[0].indexOf('[');
	const from = offset + match.index + bracketStart;
	const to = offset + match.index + match[0].length;

	return {from, to};
}
