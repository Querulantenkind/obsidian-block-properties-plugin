import {App, PluginSettingTab, Setting} from 'obsidian';
import type BlockPropertiesPlugin from './main';
import type {DisplayMode} from './types';

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
	}
}
