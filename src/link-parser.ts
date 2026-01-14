import {ParsedLink, ParsedValue} from './types';

// Regex patterns for link detection
// Note link: [[Note]] or [[Note|alias]] or [[folder/Note]]
const NOTE_LINK_REGEX = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
// Block reference: ^block-id (standalone, not inside a note link)
const BLOCK_REF_REGEX = /\^([\w-]+)/g;

/**
 * Parse a property value and extract all links
 */
export function parseLinksInValue(value: string): ParsedValue {
	const links: ParsedLink[] = [];

	// Extract note links [[Note]] or [[Note|alias]]
	NOTE_LINK_REGEX.lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = NOTE_LINK_REGEX.exec(value)) !== null) {
		const target = match[1];
		// Skip empty links [[]]
		if (!target || target.trim() === '') continue;

		links.push({
			type: 'note',
			raw: match[0],
			target: target.trim(),
			alias: match[2]?.trim(),
		});
	}

	// Extract block references ^block-id
	// Skip if inside a note link like [[Note#^block]]
	BLOCK_REF_REGEX.lastIndex = 0;

	while ((match = BLOCK_REF_REGEX.exec(value)) !== null) {
		const blockId = match[1];
		if (!blockId) continue;

		const matchStart = match.index;

		// Check if this block ref is inside a note link
		const isInsideNoteLink = links.some(link => {
			if (link.type !== 'note') return false;
			const linkStart = value.indexOf(link.raw);
			const linkEnd = linkStart + link.raw.length;
			return matchStart >= linkStart && matchStart < linkEnd;
		});

		if (!isInsideNoteLink) {
			links.push({
				type: 'block',
				raw: match[0],
				target: blockId,
			});
		}
	}

	return {raw: value, links};
}

/**
 * Check if a value contains any links
 */
export function hasLinks(value: string): boolean {
	NOTE_LINK_REGEX.lastIndex = 0;
	BLOCK_REF_REGEX.lastIndex = 0;
	return NOTE_LINK_REGEX.test(value) || BLOCK_REF_REGEX.test(value);
}

/**
 * Check if value is exactly a single note link
 */
export function isNoteLink(value: string): boolean {
	return /^\[\[[^\]]+\]\]$/.test(value.trim());
}

/**
 * Check if value is exactly a single block reference
 */
export function isBlockRef(value: string): boolean {
	return /^\^[\w-]+$/.test(value.trim());
}

/**
 * Get positions of all links within a property value string
 * Returns ranges relative to the start of the value
 */
export function getLinkPositions(value: string): Array<{from: number; to: number; link: ParsedLink}> {
	const parsed = parseLinksInValue(value);
	const positions: Array<{from: number; to: number; link: ParsedLink}> = [];

	for (const link of parsed.links) {
		let searchFrom = 0;
		let index: number;

		// Find the position of this link's raw text
		while ((index = value.indexOf(link.raw, searchFrom)) !== -1) {
			// Check if we already recorded this position
			const alreadyRecorded = positions.some(p =>
				p.from === index && p.link.raw === link.raw
			);

			if (!alreadyRecorded) {
				positions.push({
					from: index,
					to: index + link.raw.length,
					link,
				});
				break;
			}
			searchFrom = index + 1;
		}
	}

	// Sort by position
	positions.sort((a, b) => a.from - b.from);

	return positions;
}
