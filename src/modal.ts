import { App, Modal, Notice, Setting } from 'obsidian';
import { getFormatById, getFormats } from './formats';
import {
	buildJimmyArgs,
	buildOutputFolder,
	runJimmy,
	type JimmyRunHandle,
} from './jimmy';
import { pickInputPath, isElectronDialogAvailable } from './electron-dialog';
import type { JimmySettings } from './settings';

export class JimmyImportModal extends Modal {
	private settings: JimmySettings;
	private vaultBasePath: string;
	private onSuccess: () => Promise<void>;

	private selectedFormat = 'null';
	private inputPath = '';
	private selectFilesEl: HTMLButtonElement | null = null;
	private selectFoldersEl: HTMLButtonElement | null = null;
	private logText = '';
	private isRunning = false;
	private runHandle: JimmyRunHandle | null = null;

	private logEl: HTMLPreElement | null = null;
	private runButton: HTMLButtonElement | null = null;
	private cancelButton: HTMLButtonElement | null = null;
	private copyLogButton: HTMLButtonElement | null = null;
	private inputEl: HTMLInputElement | null = null;
	private formatDropdown: Setting | null = null;

	constructor(
		app: App,
		settings: JimmySettings,
		vaultBasePath: string,
		onSuccess: () => Promise<void>,
	) {
		super(app);
		this.settings = settings;
		this.vaultBasePath = vaultBasePath;
		this.onSuccess = onSuccess;
		this.selectedFormat = 'null';
	}

	onOpen(): void {
		const { contentEl, modalEl } = this;
		contentEl.empty();
		modalEl.addClass('jimmy-import-modal');

		contentEl.createEl('h2', { text: 'Import with Jimmy' });
		contentEl.createEl('p', {
			cls: 'jimmy-import-description',
			text: 'Convert notes from another app or file format into Markdown inside this vault.',
		});

		if (!this.settings.jimmyPath.trim()) {
			const warning = contentEl.createDiv({
				cls: 'jimmy-import-warning',
			});
			warning.createSpan({
				text: 'Jimmy executable path is not configured. Set it in Settings → Jimmy Importer or download Jimmy from ',
			});
			warning.createEl('a', {
				text: 'GitHub releases',
				href: 'https://github.com/marph91/jimmy/releases',
			});
			warning.createSpan({ text: '.' });
		}

		// Create the format dropdown setting
		this.formatDropdown = new Setting(contentEl)
			.setName('Input format')
			.setDesc('Source format for the conversion.');

		// Populate the format dropdown asynchronously
		void this.populateFormatDropdown();

		const inputSetting = new Setting(contentEl)
			.setName('Input file or folder')
			.setDesc('Path to the exported notes archive or folder.');

		const inputRow = inputSetting.controlEl.createDiv({
			cls: 'jimmy-import-input-row',
		});

		this.inputEl = inputRow.createEl('input', {
			type: 'text',
			placeholder: 'C:\\Users\\you\\Downloads\\export.zip',
		});
		this.inputEl.value = this.inputPath;
		this.inputEl.addEventListener('input', () => {
			this.inputPath = this.inputEl?.value ?? '';
		});

		// Picking folders and files is not possible. Folders will be preferred.
		// https://stackoverflow.com/a/57871808/7410886
		// Add one button for each type.
		this.selectFilesEl = inputRow.createEl('button', {
			text: 'Select Files',
		});
		this.selectFilesEl.addEventListener('click', async () => {
			const formats = await getFormats(this.settings.jimmyPath);
			const format = getFormatById(this.selectedFormat, formats);
			if (format) {
				await this.browseForInput(false, format.acceptedExtensions);
			}
		});

		this.selectFoldersEl = inputRow.createEl('button', {
			text: 'Select Folders',
		});
		this.selectFoldersEl.addEventListener('click', async () => {
			const formats = await getFormats(this.settings.jimmyPath);
			const format = getFormatById(this.selectedFormat, formats);
			if (format) {
				await this.browseForInput(format.acceptFolder, []);
			}
		});

		contentEl.createEl('h3', { text: 'Log output' });
		this.logEl = contentEl.createEl('pre', {
			cls: 'jimmy-import-log',
			text: 'Log output will appear here when the conversion starts.',
		});

		const actions = contentEl.createDiv({ cls: 'jimmy-import-actions' });
		this.cancelButton = actions.createEl('button', { text: 'Close' });
		this.cancelButton.addEventListener('click', () => {
			if (this.isRunning) {
				this.stopConversion();
			}
			this.close();
		});

		// Add Copy Log button between Close and Run Conversion buttons
		this.copyLogButton = actions.createEl('button', { text: 'Copy Log' });
		this.copyLogButton.addEventListener('click', () => {
			this.copyLogToClipboard();
		});

		this.runButton = actions.createEl('button', {
			cls: 'mod-cta',
			text: 'Run conversion',
		});
		this.runButton.addEventListener('click', () => {
			this.startConversion();
		});
	}

	private async populateFormatDropdown(): Promise<void> {
		if (!this.formatDropdown) return;

		try {
			const formats = await getFormats(this.settings.jimmyPath);

			this.formatDropdown.addDropdown((dropdown) => {
				for (const format of formats) {
					dropdown.addOption(format.id, format.label);
				}

				dropdown.setValue(this.selectedFormat).onChange((value) => {
					this.selectedFormat = value;

					// disable format buttons if needed
					const format = getFormatById(this.selectedFormat, formats);
					if (this.selectFilesEl)
						this.selectFilesEl.disabled =
							!format?.acceptedExtensions;
					if (this.selectFoldersEl)
						this.selectFoldersEl.disabled = !format?.acceptFolder;
				});
			});
		} catch (error) {
			console.error('Failed to populate format dropdown:', error);
			new Notice(`Failed to load formats from Jimmy.`);
		}
	}

	onClose(): void {
		if (this.isRunning) {
			this.stopConversion();
		}

		const { contentEl } = this;
		contentEl.empty();
	}

	private async browseForInput(
		acceptFolder: boolean,
		acceptedExtensions: string[] | null,
	): Promise<void> {
		const selectedPath = pickInputPath(
			acceptFolder ?? true,
			acceptedExtensions ?? null,
		);

		if (!selectedPath) {
			if (!isElectronDialogAvailable()) {
				new Notice(
					'Native file picker is unavailable. Enter the input path manually.',
				);
			}
			return;
		}

		this.inputPath = selectedPath;
		if (this.inputEl) {
			this.inputEl.value = selectedPath;
		}
	}

	private appendLog(line: string, stream: 'stdout' | 'stderr'): void {
		const prefix = stream === 'stderr' ? '[stderr] ' : '';
		const nextLine = line.length > 0 ? `${prefix}${line}` : '';
		this.logText = this.logText ? `${this.logText}\n${nextLine}` : nextLine;

		if (this.logEl) {
			this.logEl.setText(this.logText);
			this.logEl.scrollTop = this.logEl.scrollHeight;
		}
	}

	private setRunning(running: boolean): void {
		this.isRunning = running;

		if (this.runButton) {
			this.runButton.disabled = running;
			this.runButton.setText(running ? 'Running...' : 'Run conversion');
		}

		if (this.cancelButton) {
			this.cancelButton.setText(running ? 'Cancel' : 'Close');
		}

		// Disable copy log button while running
		if (this.copyLogButton) {
			this.copyLogButton.disabled = running;
		}
	}

	private stopConversion(): void {
		this.runHandle?.kill();
		this.runHandle = null;
		this.setRunning(false);
		this.appendLog('Conversion cancelled.', 'stderr');
	}

	private copyLogToClipboard(): void {
		if (this.logText && navigator.clipboard) {
			void navigator.clipboard
				.writeText(this.logText)
				.then(() => {
					new Notice('Log copied to clipboard.');
				})
				.catch(() => {
					new Notice('Failed to copy log to clipboard.');
				});
		} else {
			new Notice('No log content to copy.');
		}
	}

	private async startConversion(): Promise<void> {
		if (this.isRunning) {
			return;
		}

		const jimmyPath = this.settings.jimmyPath.trim();
		const inputPath = (this.inputEl?.value ?? this.inputPath).trim();
		const outputFolder = buildOutputFolder(
			this.vaultBasePath,
			this.settings.outputSubfolder,
		);

		if (!jimmyPath) {
			new Notice(
				'Configure the Jimmy executable path in plugin settings.',
			);
			return;
		}

		if (!inputPath) {
			new Notice('Select an input file or folder.');
			return;
		}

		this.logText = '';
		if (this.logEl) {
			this.logEl.empty();
		}

		const options = {
			jimmyPath,
			inputPath,
			format: this.selectedFormat,
			outputFolder,
			frontmatter: this.settings.frontmatter,
			extraArgs: this.settings.extraArgs,
		};

		const commandPreview = [jimmyPath, ...buildJimmyArgs(options)].join(
			' ',
		);
		this.appendLog(`Starting: ${commandPreview}`, 'stdout');
		this.appendLog(`Output folder: ${outputFolder}`, 'stdout');
		this.setRunning(true);

		this.runHandle = runJimmy(
			options,
			(line, stream) => {
				this.appendLog(line, stream);
			},
			(exitCode) => {
				this.runHandle = null;
				this.setRunning(false);

				if (exitCode === 0) {
					this.appendLog(
						'Conversion finished successfully.',
						'stdout',
					);
					void this.onSuccess();
					new Notice('Jimmy import completed.');
					return;
				}

				const message =
					exitCode === null
						? 'Conversion failed to start.'
						: `Conversion failed with exit code ${exitCode}.`;
				this.appendLog(message, 'stderr');
				new Notice('Jimmy import failed. Check the log for details.');
			},
		);
	}
}
