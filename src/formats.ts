import { runJimmy } from './jimmy';

export interface JimmyFormat {
	id: string;
	label: string;
	acceptFolder: boolean;
	acceptedExtensions: string[] | null;
}

// Cache for formats to avoid repeated calls
let cachedFormats: JimmyFormat[] | null = null;

/**
 * Fetches available formats from Jimmy by running 'jimmy list-formats'
 * @param jimmyPath Path to the Jimmy executable
 * @returns Promise that resolves to an array of JimmyFormat objects
 */
export async function fetchFormatsFromJimmy(
	jimmyPath: string,
): Promise<JimmyFormat[]> {
	// Create a promise that will be resolved when we get the output
	return new Promise((resolve, reject) => {
		let stdoutData = '';
		let stderrData = '';

		try {
			runJimmy(
				{
					jimmyPath,
					inputPath: '',
					format: '',
					outputFolder: '',
					frontmatter: '',
					extraArgs: 'list-formats',
				},
				(line, stream) => {
					if (stream === 'stdout') {
						stdoutData += line + '\n';
					} else {
						stderrData += line + '\n';
					}
				},
				(exitCode) => {
					if (exitCode === 0) {
						try {
							// Parse the JSON output from stdout
							const parsedFormats: {
								[key: string]: {
									accept_folder: boolean;
									accepted_extensions: string[] | null;
								};
							} = JSON.parse(stdoutData);
							const formats: JimmyFormat[] = [];
							for (const [
								format,
								allowedInputs,
							] of Object.entries(parsedFormats)) {
								formats.push({
									id: format.toLowerCase(),
									label:
										format === 'null' ? 'default' : format,
									acceptFolder:
										allowedInputs['accept_folder'],
									acceptedExtensions:
										allowedInputs['accepted_extensions'],
								});
							}
							resolve(formats);
						} catch (parseError) {
							reject(
								new Error(
									`Failed to parse JSON output: ${parseError}`,
								),
							);
						}
					} else {
						reject(
							new Error(
								`Jimmy exited with code ${exitCode}: ${stderrData}`,
							),
						);
					}
				},
			);
		} catch (error) {
			reject(new Error(`Failed to run Jimmy: ${error}`));
		}
	});
}

/**
 * Gets the list of available formats from Jimmy
 * @param jimmyPath Path to the Jimmy executable
 * @returns Promise that resolves to an array of JimmyFormat objects
 */
export async function getFormats(jimmyPath: string): Promise<JimmyFormat[]> {
	// Return cached formats if available
	if (cachedFormats) {
		return cachedFormats;
	}

	try {
		// Try to fetch formats from Jimmy
		const formats = await fetchFormatsFromJimmy(jimmyPath);
		cachedFormats = formats;
		return formats;
	} catch (error) {
		console.warn('Failed to fetch formats from Jimmy:', error);
		return [];
	}
}

export function getFormatById(
	id: string,
	formats: JimmyFormat[],
): JimmyFormat | undefined {
	return formats.find((format) => format.id === id);
}

export function getFormatLabel(id: string, formats: JimmyFormat[]): string {
	return getFormatById(id, formats)?.label ?? id;
}
