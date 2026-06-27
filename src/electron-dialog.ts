interface ElectronDialog {
	showOpenDialogSync: (
		options: Record<string, unknown>,
	) => string[] | undefined;
}

interface ElectronModule {
	remote?: {
		dialog?: ElectronDialog;
	};
	dialog?: ElectronDialog;
}

function getElectronDialog(): ElectronDialog | null {
	try {
		const electron = (
			window as Window & {
				require?: (module: string) => ElectronModule;
			}
		).require?.('electron');

		return electron?.remote?.dialog ?? electron?.dialog ?? null;
	} catch {
		return null;
	}
}

function pickPath(options: Record<string, unknown>): string | null {
	const dialog = getElectronDialog();
	if (!dialog) {
		return null;
	}

	const result = dialog.showOpenDialogSync(options);
	if (!result || result.length === 0) {
		return null;
	}

	return result[0] ?? null;
}

export function isElectronDialogAvailable(): boolean {
	return getElectronDialog() !== null;
}

export function pickExecutablePath(): string | null {
	return pickPath({
		title: 'Select Jimmy executable',
		properties: ['openFile'],
	});
}

export function pickInputPath(
	acceptFolder: boolean,
	acceptedExtensions: string[] | null,
): string | null {
	const properties = [];
	if (acceptFolder) {
		properties.push('openDirectory');
	}
	if (acceptedExtensions) {
		properties.push('openFile');
	}

	const options: Record<string, unknown> = {
		title: 'Select input',
		properties,
	};

	if (
		acceptedExtensions &&
		acceptedExtensions.length > 0 &&
		!acceptedExtensions.includes('*')
	) {
		options.filters = [
			{
				name: acceptedExtensions.join(', '),
				extensions: acceptedExtensions.map((extension) =>
					extension.replace(/^\./, ''),
				),
			},
		];
	}

	return pickPath(options);
}
