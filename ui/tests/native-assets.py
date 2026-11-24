"""Native wrappers keep all original media offline, without an extra resource server."""
from pathlib import Path
import hashlib
import sys

root=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(root/'packaging'))
from runtime_assets import inline_runtime

dist=root/'online/dist'
html=(dist/'index.html').read_text(encoding='utf-8')
standalone=inline_runtime(html,dist)
assert 'assets/runtime/' not in standalone
for name in ('packaging/android/app/assets/index.html','packaging/desktop/game/index.html','packaging/ios/Manager/game.html'):
    text=(root/name).read_text(encoding='utf-8')
    assert 'assets/runtime/' not in text,name
    assert 'id="main-menu"' in text,name
    assert 'data-menu="continue"' in text,name
print('PASS: three native clients contain shared menu and all media in offline HTML')
