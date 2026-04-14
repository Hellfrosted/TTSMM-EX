import chalk from 'chalk';

const [requiredPlatform, commandName = 'This command'] = process.argv.slice(2);

if (!requiredPlatform) {
	throw new Error('Usage: node --import=tsx ./scripts/require-platform.ts <platform> [commandName]');
}

if (process.platform !== requiredPlatform) {
	console.error(
		chalk.red(`${commandName} requires ${requiredPlatform}. Current platform: ${process.platform}. Run it from a matching environment.`)
	);
	process.exit(1);
}
