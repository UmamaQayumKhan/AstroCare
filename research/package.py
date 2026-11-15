"""Package original benchmark code and derived artifacts, not original health records."""
from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
import shutil

root=Path(__file__).resolve().parent
public=root.parent/'public'
public.mkdir(exist_ok=True)
shutil.copyfile(root/'README.md',public/'research-methods.md')
with ZipFile(public/'research-benchmark.zip','w',ZIP_DEFLATED) as archive:
    for name in ['README.md','requirements.txt','download.mjs','train.py','test_pipeline.py','package.py']:
        archive.write(root/name,'research/'+name)
    for file in (root/'artifacts').iterdir():
        if file.is_file():archive.write(file,'research/artifacts/'+file.name)
print('Packaged reproducible code, trained models, split IDs, predictions and metrics.')
