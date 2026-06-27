import { FileSystemAdapter, Notice, Plugin } from 'obsidian';
import { JimmyImportModal } from './modal';
import {
	DEFAULT_SETTINGS,
	JimmySettingTab,
	type JimmySettings,
} from './settings';

export default class JimmyImporterPlugin extends Plugin {
	settings!: JimmySettings;

	async onload(): Promise<void> {
		await this.loadSettings();

		this.addRibbonIcon('download', 'Import with Jimmy', () => {
			this.openImportModal();
		});

		this.addCommand({
			id: 'jimmy-import',
			name: 'Import with Jimmy',
			callback: () => {
				this.openImportModal();
			},
		});

		this.addSettingTab(new JimmySettingTab(this.app, this));
	}

	onunload(): void {}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<JimmySettings>,
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private getVaultBasePath(): string | null {
		const adapter = this.app.vault.adapter;
		if (!(adapter instanceof FileSystemAdapter)) {
			return null;
		}

		return adapter.getBasePath();
	}

	private async refreshVault(): Promise<void> {
		const outputFolder = this.settings.outputSubfolder;

		try {
			const exists = await this.app.vault.adapter.exists(outputFolder);
			if (!exists) {
				await this.app.vault.createFolder(outputFolder);
			}

			await this.app.vault.adapter.list(outputFolder);
		} catch (error) {
			console.warn('Vault refresh after Jimmy import:', error);
		}
	}

	openImportModal(): void {
		const vaultBasePath = this.getVaultBasePath();
		if (!vaultBasePath) {
			new Notice('Jimmy Importer requires a local vault folder.');
			return;
		}

		new JimmyImportModal(
			this.app,
			this.settings,
			vaultBasePath,
			async () => {
				await this.refreshVault();
			},
		).open();
	}
}
