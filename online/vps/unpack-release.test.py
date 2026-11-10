import io
import pathlib
import subprocess
import sys
import tarfile
import tempfile
import unittest

VERIFIER = pathlib.Path(__file__).with_name("unpack-release.py")

class ArchiveSafety(unittest.TestCase):
    def test_rejects_unsafe_or_incomplete_archives(self):
        for name, kind in [
            ("../escape", tarfile.REGTYPE),
            ("/absolute-path", tarfile.REGTYPE),
            ("online/dist/index.html", tarfile.SYMTYPE),
            ("online/vps/backup.sh", tarfile.REGTYPE),
            ("online/dist/index.html", tarfile.REGTYPE),
        ]:
            with self.subTest(name=name, kind=kind), tempfile.TemporaryDirectory() as folder:
                folder = pathlib.Path(folder)
                archive = folder / "runtime.tgz"
                with tarfile.open(archive, "w:gz") as bundle:
                    item = tarfile.TarInfo(name)
                    item.type = kind
                    if kind == tarfile.SYMTYPE:
                        item.linkname = "/etc/passwd"
                        bundle.addfile(item)
                    else:
                        item.size = 1
                        bundle.addfile(item, io.BytesIO(b"x"))
                result = subprocess.run([sys.executable, str(VERIFIER), str(archive),
                                         str(folder / "stage")], capture_output=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse((folder / "escape").exists())
                self.assertFalse((folder / "stage/online/vps/backup.sh").exists())
                self.assertFalse((folder / "stage/online/dist/index.html").is_symlink())

if __name__ == "__main__":
    unittest.main()
