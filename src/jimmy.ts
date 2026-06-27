import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import process from 'process';
import { join } from 'path';

export interface JimmyRunOptions {
	jimmyPath: string;
	inputPath: string;
	format: string;
	outputFolder: string;
	frontmatter: string;
	extraArgs: string;
}

export interface JimmyRunHandle {
	child: ChildProcessWithoutNullStreams;
	kill: () => void;
}

function parseExtraArgs(extraArgs: string): string[] {
	const trimmed = extraArgs.trim();
	if (!trimmed) {
		return [];
	}

	const args: string[] = [];
	const regex = /"([^"]*)"|'([^']*)'|(\S+)/g;
	let match: RegExpExecArray | null;

	while ((match = regex.exec(trimmed)) !== null) {
		args.push(match[1] ?? match[2] ?? match[3] ?? '');
	}

	return args;
}

export function buildJimmyArgs(options: JimmyRunOptions): string[] {
	// Check if this is a list-formats command
	const extraArgs = parseExtraArgs(options.extraArgs);
	if (extraArgs.includes('list-formats')) {
		// For list-formats, we don't need the 'cli' subcommand or input path
		return ['list-formats'];
	}

	// Regular conversion command
	const args = [
		'cli',
		`'${options.inputPath}'`,
		'--stdout-log-level',
		'DEBUG',
	];

	if (options.format && options.format !== 'none') {
		args.push('--format', options.format);
	}

	args.push('--output-folder', options.outputFolder);

	if (options.frontmatter) {
		args.push('--frontmatter', options.frontmatter);
	}

	args.push(...extraArgs);
	return args;
}

export function runJimmy(
	options: JimmyRunOptions,
	onLine: (line: string, stream: 'stdout' | 'stderr') => void,
	onDone: (exitCode: number | null) => void,
): JimmyRunHandle {
	const args = buildJimmyArgs(options);
	const child = spawn(options.jimmyPath, args, {
		windowsHide: true,
		shell: true,
		env: {
			...process.env,
			COLUMNS: '500', // increase terminal width to prevent line wrapping
		},
	});

	let stdoutBuffer = '';
	let stderrBuffer = '';

	const flushLines = (buffer: string, stream: 'stdout' | 'stderr') => {
		const lines = buffer.split(/\r?\n/);
		const remainder = lines.pop() ?? '';

		for (const line of lines) {
			onLine(line, stream);
		}

		return remainder;
	};

	child.stdout.on('data', (chunk: Buffer) => {
		stdoutBuffer += chunk.toString('utf8');
		stdoutBuffer = flushLines(stdoutBuffer, 'stdout');
	});

	child.stderr.on('data', (chunk: Buffer) => {
		stderrBuffer += chunk.toString('utf8');
		stderrBuffer = flushLines(stderrBuffer, 'stderr');
	});

	child.on('close', (exitCode) => {
		if (stdoutBuffer) {
			onLine(stdoutBuffer, 'stdout');
		}
		if (stderrBuffer) {
			onLine(stderrBuffer, 'stderr');
		}
		onDone(exitCode);
	});

	child.on('error', (error) => {
		onLine(error.message, 'stderr');
		onDone(null);
	});

	return {
		child,
		kill: () => {
			child.kill();
		},
	};
}

export function buildOutputFolder(
	vaultBasePath: string,
	subfolder: string,
): string {
	return join(vaultBasePath, subfolder);
}
