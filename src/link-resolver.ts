import {App, TFile} from 'obsidian';
import {ParsedLink} from './types';

export interface ResolvedLink {
	file: TFile | null;
	blockId?: string;
	line?: number;
	exists: boolean;
}

/**
 * Resolve a note link to a file
 */
export function resolveNoteLink(
	app: App,
	linkText: string,
	sourcePath: string
): ResolvedLink {
	const file = app.metadataCache.getFirstLinkpathDest(linkText, sourcePath);
	return {
		file,
		exists: file !== null,
	};
}

/**
 * Resolve a block reference to a file and line
 * Searches current file first, then optionally the whole vault
 */
export async function resolveBlockRef(
	app: App,
	blockId: string,
	currentFile?: TFile,
	searchVault = true
): Promise<ResolvedLink> {
	// Search current file first
	if (currentFile) {
		const content = await app.vault.cachedRead(currentFile);
		const lineIndex = findBlockInContent(content, blockId);
		if (lineIndex !== -1) {
			return {file: currentFile, blockId, line: lineIndex, exists: true};
		}
	}

	// Search vault if enabled
	if (searchVault) {
		for (const file of app.vault.getMarkdownFiles()) {
			if (file === currentFile) continue;
			const content = await app.vault.cachedRead(file);
			const lineIndex = findBlockInContent(content, blockId);
			if (lineIndex !== -1) {
				return {file, blockId, line: lineIndex, exists: true};
			}
		}
	}

	return {file: null, exists: false};
}

/**
 * Find a block ID in content and return its line number (0-indexed)
 */
function findBlockInContent(content: string, blockId: string): number {
	const lines = content.split('\n');
	const pattern = new RegExp(`\\^${blockId}(?:\\s|\\[|$)`);

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line && pattern.test(line)) {
			return i;
		}
	}
	return -1;
}

/**
 * Navigate to a resolved link
 */
export async function navigateToLink(
	app: App,
	link: ParsedLink,
	sourcePath: string,
	currentFile?: TFile
): Promise<boolean> {
	if (link.type === 'note') {
		const resolved = resolveNoteLink(app, link.target, sourcePath);
		if (resolved.file) {
			const leaf = app.workspace.getLeaf();
			await leaf.openFile(resolved.file);
			return true;
		}
	} else if (link.type === 'block') {
		const resolved = await resolveBlockRef(app, link.target, currentFile);
		if (resolved.file && resolved.line !== undefined) {
			const leaf = app.workspace.getLeaf();
			await leaf.openFile(resolved.file);

			// Scroll to line
			const view = leaf.view;
			if (view.getViewType() === 'markdown') {
				// Use setTimeout to ensure file is loaded
				setTimeout(() => {
					const editor = (view as any).editor;
					if (editor) {
						editor.setCursor({line: resolved.line!, ch: 0});
						editor.scrollIntoView({
							from: {line: resolved.line!, ch: 0},
							to: {line: resolved.line!, ch: 0},
						}, true);
					}
				}, 100);
			}
			return true;
		}
	}

	return false;
}

/**
 * Get all block IDs from a file
 */
export async function getBlockIdsFromFile(
	app: App,
	file: TFile
): Promise<string[]> {
	const content = await app.vault.cachedRead(file);
	const blockIds: string[] = [];
	const regex = /\^([\w-]+)/g;
	let match: RegExpExecArray | null;

	while ((match = regex.exec(content)) !== null) {
		const id = match[1];
		if (id && !blockIds.includes(id)) {
			blockIds.push(id);
		}
	}

	return blockIds;
}

/**
 * Get all block IDs from the vault
 */
export async function getAllBlockIds(app: App): Promise<Map<string, TFile>> {
	const blockIds = new Map<string, TFile>();

	for (const file of app.vault.getMarkdownFiles()) {
		const ids = await getBlockIdsFromFile(app, file);
		for (const id of ids) {
			// First occurrence wins
			if (!blockIds.has(id)) {
				blockIds.set(id, file);
			}
		}
	}

	return blockIds;
}
