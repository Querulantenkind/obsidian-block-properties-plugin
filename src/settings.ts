import {App, PluginSettingTab, Setting} from 'obsidian';
import type BlockPropertiesPlugin from './main';
import type {DisplayMode, PropertyTemplate} from './types';
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
}
