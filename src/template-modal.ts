import {App, Modal, Notice, Setting} from 'obsidian';
import type {PropertyTemplate, BlockProperty} from './types';

export class TemplateEditModal extends Modal {
	private template: PropertyTemplate;
	private onSave: (template: PropertyTemplate) => void;
	private isNew: boolean;

	constructor(
		app: App,
		existing: PropertyTemplate | null,
		onSave: (template: PropertyTemplate) => void
	) {
		super(app);
		this.isNew = !existing;
		this.template = existing
			? {...existing, properties: existing.properties.map((p) => ({...p}))}
			: {name: '', properties: [{key: '', value: ''}]};
		this.onSave = onSave;
	}

	onOpen(): void {
		const {contentEl} = this;
		contentEl.addClass('block-properties-template-modal');

		contentEl.createEl('h2', {
			text: this.isNew ? 'Create Template' : 'Edit Template',
		});

		new Setting(contentEl)
			.setName('Template name')
			.setDesc('Used in "preset: name" syntax')
			.addText((text) =>
				text
					.setPlaceholder('task')
					.setValue(this.template.name)
					.onChange((value) => {
						this.template.name = value
							.trim()
							.toLowerCase()
							.replace(/\s+/g, '-');
					})
			);

		contentEl.createEl('h4', {text: 'Properties'});

		const propsContainer = contentEl.createEl('div', {
			cls: 'block-properties-template-props',
		});

		this.renderProperties(propsContainer);

		new Setting(contentEl)
			.addButton((btn) =>
				btn.setButtonText('Cancel').onClick(() => this.close())
			)
			.addButton((btn) =>
				btn
					.setButtonText('Save')
					.setCta()
					.onClick(() => {
						if (!this.template.name) {
							new Notice('Template name is required');
							return;
						}
						this.template.properties = this.template.properties.filter(
							(p) => p.key.trim()
						);
						if (this.template.properties.length === 0) {
							new Notice('At least one property is required');
							return;
						}
						this.onSave(this.template);
						this.close();
					})
			);
	}

	private renderProperties(container: HTMLElement): void {
		container.empty();

		for (let i = 0; i < this.template.properties.length; i++) {
			const prop = this.template.properties[i];
			if (!prop) continue;

			const row = container.createEl('div', {
				cls: 'block-properties-template-prop-row',
			});

			const keyInput = row.createEl('input', {
				type: 'text',
				placeholder: 'key',
				value: prop.key,
				cls: 'block-properties-template-input',
			});
			keyInput.addEventListener('input', (e) => {
				prop.key = (e.target as HTMLInputElement).value;
			});

			row.createEl('span', {text: ':'});

			const valueInput = row.createEl('input', {
				type: 'text',
				placeholder: 'default value',
				value: prop.value,
				cls: 'block-properties-template-input',
			});
			valueInput.addEventListener('input', (e) => {
				prop.value = (e.target as HTMLInputElement).value;
			});

			const deleteBtn = row.createEl('button', {
				cls: 'block-properties-template-delete-btn',
			});
			deleteBtn.innerHTML = '&times;';
			deleteBtn.addEventListener('click', () => {
				this.template.properties.splice(i, 1);
				if (this.template.properties.length === 0) {
					this.template.properties.push({key: '', value: ''});
				}
				this.renderProperties(container);
			});
		}

		const addBtn = container.createEl('button', {
			text: '+ Add property',
			cls: 'block-properties-template-add-btn',
		});
		addBtn.addEventListener('click', () => {
			this.template.properties.push({key: '', value: ''});
			this.renderProperties(container);
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

export class TemplatePickerModal extends Modal {
	private templates: PropertyTemplate[];
	private onSelect: (template: PropertyTemplate) => void;

	constructor(
		app: App,
		templates: PropertyTemplate[],
		onSelect: (template: PropertyTemplate) => void
	) {
		super(app);
		this.templates = templates;
		this.onSelect = onSelect;
	}

	onOpen(): void {
		const {contentEl} = this;
		contentEl.createEl('h2', {text: 'Select Template'});

		if (this.templates.length === 0) {
			contentEl.createEl('p', {
				text: 'No templates defined. Add templates in settings.',
				cls: 'block-properties-no-templates',
			});
			return;
		}

		const list = contentEl.createEl('div', {
			cls: 'block-properties-template-list',
		});

		for (const template of this.templates) {
			const item = list.createEl('div', {
				cls: 'block-properties-template-item',
			});

			item.createEl('div', {
				text: template.name,
				cls: 'block-properties-template-name',
			});

			item.createEl('div', {
				text: template.properties
					.map((p) => `${p.key}: ${p.value || '...'}`)
					.join(', '),
				cls: 'block-properties-template-preview',
			});

			item.addEventListener('click', () => {
				this.onSelect(template);
				this.close();
			});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
