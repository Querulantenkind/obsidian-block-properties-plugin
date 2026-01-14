import {App, PluginSettingTab, Setting} from 'obsidian';
import type BlockPropertiesPlugin from './main';
import type {DisplayMode, PropertyTemplate, StyleRule, StylingTarget} from './types';
import {TemplateEditModal} from './template-modal';

export class BlockPropertiesSettingTab extends PluginSettingTab {
	plugin: BlockPropertiesPlugin;

	constructor(app: App, plugin: BlockPropertiesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		containerEl.createEl('h2', {text: 'Block Properties Settings'});

		new Setting(containerEl)
			.setName('Display mode')
			.setDesc('How to display block properties in the editor')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('inline', 'Inline (dimmed text)')
					.addOption('badge', 'Badge (compact icon)')
					.setValue(this.plugin.settings.displayMode)
					.onChange(async (value: DisplayMode) => {
						this.plugin.settings.displayMode = value;
						await this.plugin.saveSettings();
						this.plugin.refreshEditorExtension();
					})
			);

		new Setting(containerEl)
			.setName('Property color')
			.setDesc('Color used to display block properties')
			.addText((text) =>
				text
					.setPlaceholder('#888888')
					.setValue(this.plugin.settings.propertyColor)
					.onChange(async (value) => {
						this.plugin.settings.propertyColor = value || '#888888';
						await this.plugin.saveSettings();
						this.plugin.updateStyles();
					})
			);

		new Setting(containerEl)
			.setName('Opacity')
			.setDesc('Opacity of block properties (0.1 - 1.0)')
			.addSlider((slider) =>
				slider
					.setLimits(0.1, 1.0, 0.1)
					.setValue(this.plugin.settings.opacity)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.opacity = value;
						await this.plugin.saveSettings();
						this.plugin.updateStyles();
					})
			);

		// Linked Properties section
		containerEl.createEl('h3', {text: 'Linked Properties'});

		new Setting(containerEl)
			.setName('Enable linked properties')
			.setDesc('Allow property values to contain links to notes ([[Note]]) and blocks (^block-id). Cmd/Ctrl+click to navigate.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableLinkedProperties)
					.onChange(async (value) => {
						this.plugin.settings.enableLinkedProperties = value;
						await this.plugin.saveSettings();
						this.plugin.refreshEditorExtension();
					})
			);

		new Setting(containerEl)
			.setName('Show backlinks in panel')
			.setDesc('Display a "Referenced by" section in the property panel showing blocks that link to this block')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.showBacklinksInPanel)
					.onChange(async (value) => {
						this.plugin.settings.showBacklinksInPanel = value;
						await this.plugin.saveSettings();
					})
			);

		// Conditional Styling section
		containerEl.createEl('h3', {text: 'Conditional Styling'});

		new Setting(containerEl)
			.setName('Enable conditional styling')
			.setDesc('Add CSS classes based on property values (e.g., bp-status-done). This enables visual styling of blocks based on their properties.')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableConditionalStyling)
					.onChange(async (value) => {
						this.plugin.settings.enableConditionalStyling = value;
						await this.plugin.saveSettings();
						this.plugin.updateStyles();
						this.plugin.refreshEditorExtension();
					})
			);

		new Setting(containerEl)
			.setName('Styling target')
			.setDesc('Apply styles to the property text only, or to the entire line')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('property', 'Property only')
					.addOption('line', 'Entire line')
					.setValue(this.plugin.settings.stylingTarget)
					.onChange(async (value: StylingTarget) => {
						this.plugin.settings.stylingTarget = value;
						await this.plugin.saveSettings();
						this.plugin.refreshEditorExtension();
					})
			);

		new Setting(containerEl)
			.setName('Use preset styles')
			.setDesc('Apply built-in visual styles for common properties (status: done = strikethrough, priority: high = red accent, etc.)')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.usePresetStyles)
					.onChange(async (value) => {
						this.plugin.settings.usePresetStyles = value;
						await this.plugin.saveSettings();
						this.plugin.updateStyles();
					})
			);

		// Custom style rules
		const rulesContainer = containerEl.createEl('div', {
			cls: 'block-properties-rules-container',
		});

		this.renderCustomRulesList(rulesContainer);

		// Templates section
		containerEl.createEl('h3', {text: 'Property Templates'});

		new Setting(containerEl)
			.setName('Auto-expand presets')
			.setDesc('Automatically expand "preset: name" to full template properties when selected from autocomplete')
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.autoExpandPresets)
					.onChange(async (value) => {
						this.plugin.settings.autoExpandPresets = value;
						await this.plugin.saveSettings();
					})
			);

		const templatesContainer = containerEl.createEl('div', {
			cls: 'block-properties-templates-container',
		});

		this.renderTemplatesList(templatesContainer);
	}

	private renderTemplatesList(container: HTMLElement): void {
		container.empty();

		for (let i = 0; i < this.plugin.settings.templates.length; i++) {
			const template = this.plugin.settings.templates[i];
			if (template) {
				this.renderTemplateItem(container, template, i);
			}
		}

		new Setting(container).addButton((btn) =>
			btn
				.setButtonText('Add template')
				.setCta()
				.onClick(() => {
					this.openTemplateModal(null, (newTemplate) => {
						this.plugin.settings.templates.push(newTemplate);
						this.plugin.saveSettings();
						this.renderTemplatesList(container);
					});
				})
		);
	}

	private renderTemplateItem(
		container: HTMLElement,
		template: PropertyTemplate,
		index: number
	): void {
		new Setting(container)
			.setName(template.name)
			.setDesc(
				template.properties
					.map((p) => `${p.key}: ${p.value || '(empty)'}`)
					.join(', ')
			)
			.addButton((btn) =>
				btn
					.setIcon('pencil')
					.setTooltip('Edit')
					.onClick(() => {
						this.openTemplateModal(template, (updated) => {
							this.plugin.settings.templates[index] = updated;
							this.plugin.saveSettings();
							this.renderTemplatesList(container);
						});
					})
			)
			.addButton((btn) =>
				btn
					.setIcon('trash')
					.setTooltip('Delete')
					.onClick(async () => {
						this.plugin.settings.templates.splice(index, 1);
						await this.plugin.saveSettings();
						this.renderTemplatesList(container);
					})
			);
	}

	private openTemplateModal(
		existing: PropertyTemplate | null,
		onSave: (template: PropertyTemplate) => void
	): void {
		new TemplateEditModal(this.app, existing, onSave).open();
	}

	private renderCustomRulesList(container: HTMLElement): void {
		container.empty();

		const rules = this.plugin.settings.customStyleRules;

		if (rules.length > 0) {
			const desc = container.createEl('p', {
				cls: 'setting-item-description',
				text: 'Custom rules for applying CSS classes based on property values:',
			});
			desc.style.marginBottom = '8px';
		}

		for (let i = 0; i < rules.length; i++) {
			const rule = rules[i];
			if (rule) {
				this.renderRuleItem(container, rule, i);
			}
		}

		new Setting(container)
			.setName('Add custom style rule')
			.setDesc('Add a rule to apply a CSS class when a property matches a condition')
			.addButton((btn) =>
				btn
					.setButtonText('Add rule')
					.onClick(() => {
						this.openRuleModal(null, (newRule) => {
							this.plugin.settings.customStyleRules.push(newRule);
							this.plugin.saveSettings();
							this.plugin.refreshEditorExtension();
							this.renderCustomRulesList(container);
						});
					})
			);
	}

	private renderRuleItem(
		container: HTMLElement,
		rule: StyleRule,
		index: number
	): void {
		const valueDisplay = rule.value === '*' ? '(any value)' : rule.value;

		new Setting(container)
			.setName(`${rule.key}: ${valueDisplay}`)
			.setDesc(`→ ${rule.className}`)
			.addButton((btn) =>
				btn
					.setIcon('pencil')
					.setTooltip('Edit')
					.onClick(() => {
						this.openRuleModal(rule, (updated) => {
							this.plugin.settings.customStyleRules[index] = updated;
							this.plugin.saveSettings();
							this.plugin.refreshEditorExtension();
							this.renderRuleItem(container, updated, index);
						});
					})
			)
			.addButton((btn) =>
				btn
					.setIcon('trash')
					.setTooltip('Delete')
					.onClick(async () => {
						this.plugin.settings.customStyleRules.splice(index, 1);
						await this.plugin.saveSettings();
						this.plugin.refreshEditorExtension();
						this.renderCustomRulesList(container);
					})
			);
	}

	private openRuleModal(
		existing: StyleRule | null,
		onSave: (rule: StyleRule) => void
	): void {
		new StyleRuleModal(this.app, existing, onSave).open();
	}
}

import {Modal, TextComponent} from 'obsidian';

class StyleRuleModal extends Modal {
	private existing: StyleRule | null;
	private onSave: (rule: StyleRule) => void;

	private keyInput: TextComponent;
	private valueInput: TextComponent;
	private classInput: TextComponent;

	constructor(app: App, existing: StyleRule | null, onSave: (rule: StyleRule) => void) {
		super(app);
		this.existing = existing;
		this.onSave = onSave;
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.empty();

		contentEl.createEl('h2', {text: this.existing ? 'Edit Style Rule' : 'New Style Rule'});

		new Setting(contentEl)
			.setName('Property key')
			.setDesc('The property key to match (e.g., "status")')
			.addText((text) => {
				this.keyInput = text;
				text.setValue(this.existing?.key || '');
				text.inputEl.placeholder = 'status';
			});

		new Setting(contentEl)
			.setName('Property value')
			.setDesc('The value to match, or "*" to match any value')
			.addText((text) => {
				this.valueInput = text;
				text.setValue(this.existing?.value || '');
				text.inputEl.placeholder = 'done or *';
			});

		new Setting(contentEl)
			.setName('CSS class')
			.setDesc('The CSS class to apply when the rule matches')
			.addText((text) => {
				this.classInput = text;
				text.setValue(this.existing?.className || '');
				text.inputEl.placeholder = 'my-custom-class';
			});

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText('Cancel')
					.onClick(() => this.close())
			)
			.addButton((btn) =>
				btn
					.setButtonText('Save')
					.setCta()
					.onClick(() => {
						const key = this.keyInput.getValue().trim();
						const value = this.valueInput.getValue().trim();
						const className = this.classInput.getValue().trim();

						if (!key || !value || !className) {
							return;
						}

						this.onSave({key, value, className});
						this.close();
					})
			);
	}

	onClose() {
		this.contentEl.empty();
	}
}
