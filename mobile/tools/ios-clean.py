from pathlib import Path
import os,subprocess,shutil
root=Path(os.environ['RUNNER_TEMP'])/'manager-ios-signing'
if root.exists():
 p=root/'installed-profile-path.txt'
 if p.exists():Path(p.read_text()).unlink(missing_ok=True)
 subprocess.run(['security','delete-keychain',str(root/'signing.keychain-db')],check=False)
 shutil.rmtree(root)
