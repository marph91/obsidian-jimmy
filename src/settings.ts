import { App, PluginSettingTab, Setting } from 'obsidian';
import type JimmyImporterPlugin from './main';
import { getFormats } from './formats';
import { pickExecutablePath } from './electron-dialog';

export interface JimmySettings {
	jimmyPath: string;
	outputSubfolder: string;
	frontmatter: string;
	extraArgs: string;
}

export const DEFAULT_SETTINGS: JimmySettings = {
	jimmyPath: '',
	outputSubfolder: `${(new Date()).toISOString()} Jimmy Import`,
	frontmatter: 'obsidian',
	extraArgs: '',
};

export class JimmySettingTab extends PluginSettingTab {
	plugin: JimmyImporterPlugin;

	constructor(app: App, plugin: JimmyImporterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Jimmy Importer' });

		new Setting(containerEl)
			.setName('Jimmy executable path')
			.setDesc(
				'Path to the Jimmy binary (for example jimmy-windows.exe on Windows). Download from https://github.com/marph91/jimmy/releases',
			)
			.addText((text) =>
				text
					.setPlaceholder(
						'C:\\Users\\you\\Downloads\\jimmy-windows.exe',
					)
					.setValue(this.plugin.settings.jimmyPath)
					.onChange(async (value) => {
						this.plugin.settings.jimmyPath = value;
						await this.plugin.saveSettings();

						// obtain the formats here to have them instantly available at the import modal 
						await getFormats(value);
					}),
			)
			.addButton((button) =>
				button.setButtonText('Browse').onClick(async () => {
					const selectedPath = pickExecutablePath();
					if (!selectedPath) {
						return;
					}

					this.plugin.settings.jimmyPath = selectedPath;
					await this.plugin.saveSettings();
					this.display();
				}),
			);

		new Setting(containerEl)
			.setName('Output subfolder')
			.setDesc(
				'Converted notes are written into this folder inside the current vault.',
			)
			.addText((text) =>
				text
					.setPlaceholder('Jimmy Import')
					.setValue(this.plugin.settings.outputSubfolder)
					.onChange(async (value) => {
						this.plugin.settings.outputSubfolder = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Frontmatter')
			.setDesc('Frontmatter format passed to Jimmy.')
			.addDropdown((dropdown) =>
				dropdown
					.addOption('obsidian', 'Obsidian')
					.addOption('joplin', 'Joplin')
					.addOption('qownnotes', 'QOwnNotes')
					.addOption('', 'None')
					.setValue(this.plugin.settings.frontmatter)
					.onChange(async (value) => {
						this.plugin.settings.frontmatter = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName('Extra CLI arguments')
			.setDesc(
				'Optional additional arguments passed to Jimmy (for example --stdout-log-level DEBUG).',
			)
			.addText((text) =>
				text
					.setPlaceholder('--stdout-log-level DEBUG')
					.setValue(this.plugin.settings.extraArgs)
					.onChange(async (value) => {
						this.plugin.settings.extraArgs = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
