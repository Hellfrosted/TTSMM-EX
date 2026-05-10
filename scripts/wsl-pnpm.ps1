$ErrorActionPreference = 'Stop'

if (-not $env:WSL_PNPM_WORKING_DIRECTORY) {
	Write-Error 'WSL_PNPM_WORKING_DIRECTORY is required.'
}

$pnpmArgs = @()
if ($env:WSL_PNPM_ARGS_BASE64) {
	foreach ($encodedArg in ($env:WSL_PNPM_ARGS_BASE64 -split "`n")) {
		if (-not $encodedArg) {
			continue
		}

		$pnpmArgs += [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encodedArg))
	}
}

Set-Location -LiteralPath $env:WSL_PNPM_WORKING_DIRECTORY
& pnpm @pnpmArgs
exit $LASTEXITCODE
