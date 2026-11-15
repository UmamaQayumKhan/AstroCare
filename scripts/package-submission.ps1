param(
    [string]$OutputPath = (Join-Path (Split-Path $PSScriptRoot -Parent | Split-Path -Parent) 'AstroCare_NASA_Space_Apps_Complete.zip')
)

$ErrorActionPreference = 'Stop'
$sourceRoot = (Resolve-Path (Split-Path $PSScriptRoot -Parent)).Path
$outputFull = [System.IO.Path]::GetFullPath($OutputPath)
$tempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$stage = Join-Path $tempRoot ('AstroCare-package-' + [guid]::NewGuid().ToString('N'))
$packageRoot = Join-Path $stage 'AstroCare_NASA_Space_Apps'

$excludedDirectories = @(
    '.git','node_modules','.backend-runtime','.ml-runtime','.test-runtime',
    '.pytest_cache','.openai','__pycache__','.venv','.research-venv'
)
$excludedFiles = @(
    'astrocare.db','backend-tests-final.txt','backend-tests-final.err.txt',
    'training-verification.txt'
)

try {
    New-Item -ItemType Directory -Path $packageRoot -Force | Out-Null
    Get-ChildItem -LiteralPath $sourceRoot -Recurse -File | ForEach-Object {
        $relative = [System.IO.Path]::GetRelativePath($sourceRoot, $_.FullName)
        $parts = $relative -split '[\\/]'
        $skipDirectory = $false
        foreach ($part in $parts) {
            if ($excludedDirectories -contains $part -or $part -like '.test-temp*') {
                $skipDirectory = $true
                break
            }
        }
        $isSecretEnv = $_.Name -like '.env*' -and $_.Name -ne '.env.example'
        if (-not $skipDirectory -and -not $isSecretEnv -and $excludedFiles -notcontains $_.Name) {
            $target = Join-Path $packageRoot $relative
            $targetDirectory = Split-Path $target -Parent
            New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null
            Copy-Item -LiteralPath $_.FullName -Destination $target
        }
    }

    $checksumPath = Join-Path $packageRoot 'CHECKSUMS_SHA256.txt'
    $checksumLines = Get-ChildItem -LiteralPath $packageRoot -Recurse -File |
        Where-Object { $_.FullName -ne $checksumPath } |
        Sort-Object FullName |
        ForEach-Object {
            $relative = [System.IO.Path]::GetRelativePath($packageRoot, $_.FullName).Replace('\\','/')
            '{0}  {1}' -f (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant(), $relative
        }
    [System.IO.File]::WriteAllLines($checksumPath, $checksumLines, [System.Text.UTF8Encoding]::new($false))

    if (Test-Path -LiteralPath $outputFull) {
        Remove-Item -LiteralPath $outputFull -Force
    }
    Compress-Archive -LiteralPath $packageRoot -DestinationPath $outputFull -CompressionLevel Optimal
    Get-Item -LiteralPath $outputFull | Select-Object FullName,Length,LastWriteTime
}
finally {
    $resolvedStage = [System.IO.Path]::GetFullPath($stage)
    if ($resolvedStage.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedStage)) {
        Remove-Item -LiteralPath $resolvedStage -Recurse -Force
    }
}
