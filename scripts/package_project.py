"""Create a portable source + prebuilt frontend bundle, excluding private runtime data."""
from pathlib import Path
import zipfile
import sys

root = Path(__file__).resolve().parents[1]
destination = Path(sys.argv[1]).resolve()
destination.parent.mkdir(parents=True, exist_ok=True)
excluded = {'node_modules','.git','.venv','.research-venv','__pycache__','.pytest_cache','.test-temp','.test-runtime','.openai'}
with zipfile.ZipFile(destination,'w',zipfile.ZIP_DEFLATED) as archive:
    for p in root.rglob('*'):
        rel = p.relative_to(root)
        if p.is_file() and not any(part in excluded for part in rel.parts) and p.suffix not in {'.db','.zip','.gz'} and p.name != '.env':
            archive.write(p,Path('AstroCare')/rel)
print(destination)
