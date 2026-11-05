"""Fetch the pinned official Linux SDK archives and verify SHA-256 before extraction."""
from pathlib import Path
from zipfile import ZipFile
import argparse,json,hashlib,urllib.request,shutil
p=argparse.ArgumentParser();p.add_argument('--directory',type=Path,required=True);a=p.parse_args()
root=a.directory.resolve();root.mkdir(parents=True,exist_ok=True)
lock=json.loads(Path(__file__).with_name('toolchain-lock.json').read_text())
for item,target in zip(lock['archives'],['build-tools/35.0.0','platforms/android-35']):
 archive=root/item['file']
 if not archive.exists():
  tmp=archive.with_suffix('.download')
  with urllib.request.urlopen(item['url'],timeout=120) as response,tmp.open('wb') as out:shutil.copyfileobj(response,out)
  tmp.replace(archive)
 if archive.stat().st_size!=item['bytes'] or hashlib.sha256(archive.read_bytes()).hexdigest()!=item['sha256']:raise SystemExit('SDK checksum mismatch: '+archive.name)
 destination=root/target
 if destination.exists():continue
 extract=root/(item['file']+'.extract');extract.mkdir(exist_ok=True)
 with ZipFile(archive) as z:
  assert z.testzip() is None
  for info in z.infolist():
   path=(extract/info.filename).resolve()
   if not str(path).startswith(str(extract.resolve())+'/'):raise SystemExit('Unsafe archive path')
  z.extractall(extract)
 children=list(extract.iterdir())
 if len(children)!=1:raise SystemExit('Unexpected SDK archive layout')
 destination.parent.mkdir(parents=True,exist_ok=True);shutil.move(str(children[0]),destination);extract.rmdir()
print('Verified SDK prepared at',root)
