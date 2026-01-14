import type {BlockProperty, BlockPropertiesSettings, StyleRule} from './types';

/**
 * Sanitize a string for use as a CSS class name.
 * - Lowercase
 * - Replace non-alphanumeric characters with hyphens
 * - Collapse multiple hyphens
 * - Trim leading/trailing hyphens
 */
function sanitizeClassName(str: string): string {
	return str
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-|-$/g, '');
}

/**
 * Generate automatic CSS class names from properties.
 * Format: bp-{key}-{value}
 *
 * Example: {key: 'status', value: 'done'} → 'bp-status-done'
 */
export function generatePropertyClasses(properties: BlockProperty[]): string[] {
	const classes: string[] = [];

	for (const prop of properties) {
		const key = sanitizeClassName(prop.key);
		const value = sanitizeClassName(prop.value);

		// Skip if either key or value is empty after sanitization
		if (!key || !value) continue;

		classes.push(`bp-${key}-${value}`);
	}

	return classes;
}

/**
 * Apply custom style rules to properties.
 * Returns class names for matching rules.
 *
 * Rules can use "*" as value to match any value for a key.
 */
export function applyCustomRules(
	properties: BlockProperty[],
	rules: StyleRule[]
): string[] {
	const classes: string[] = [];

	for (const rule of rules) {
		const match = properties.find(p =>
			p.key === rule.key && (rule.value === '*' || p.value === rule.value)
		);

		if (match && rule.className) {
			classes.push(rule.className);
		}
	}

	return classes;
}

/**
 * Get all conditional CSS classes for a set of properties.
 * Combines automatic classes with custom rule classes.
 */
export function getConditionalClasses(
	properties: BlockProperty[],
	settings: BlockPropertiesSettings
): string[] {
	if (!settings.enableConditionalStyling) return [];

	const autoClasses = generatePropertyClasses(properties);
	const customClasses = applyCustomRules(properties, settings.customStyleRules);

	return [...autoClasses, ...customClasses];
}

/**
 * Check if any property matches a preset style condition.
 * Used to determine if preset styles should be applied.
 */
export function hasPresetMatch(properties: BlockProperty[]): boolean {
	const presetKeys = ['status', 'priority', 'type'];
	return properties.some(p => presetKeys.includes(p.key.toLowerCase()));
}

/**
 * Generate a single class string for DOM application.
 */
export function getClassString(
	properties: BlockProperty[],
	settings: BlockPropertiesSettings
): string {
	const classes = getConditionalClasses(properties, settings);
	return classes.join(' ');
}
