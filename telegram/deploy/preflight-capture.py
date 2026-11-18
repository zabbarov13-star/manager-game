#!/usr/bin/env python3
"""No sqlite import/open. Unix WAL files captured under cooperative POSIX locks.
Source descriptors are O_RDONLY|O_NOFOLLOW; source mount must be read-only.
SQLite unix VFS: DB shared range, SHM DMS=128, WRITE/CKPT/RECOVER=120/121/122.
"""
import fcntl, json, os, signal, stat, sys, time

def capture(source, target, inherited=False):
    started = time.monotonic()
    def deadline(*_):
        raise RuntimeError('CAPTURE_DEADLINE')
    signal.signal(signal.SIGALRM, deadline)
    signal.setitimer(signal.ITIMER_REAL, 1.0)
    descriptors = []
    try:
        for suffix in ['', '-wal', '-shm']:
            file = source + suffix
            fd = os.dup(3 + len(descriptors)) if inherited else os.open(file, os.O_RDONLY | os.O_NOFOLLOW)
            if fcntl.fcntl(fd, fcntl.F_GETFL) & os.O_ACCMODE != os.O_RDONLY:
                raise RuntimeError('SOURCE_DESCRIPTOR_NOT_READ_ONLY')
            descriptors.append(fd)
            st = os.fstat(fd)
            if fcntl.fcntl(fd, fcntl.F_GETFL) & os.O_ACCMODE != os.O_RDONLY or not stat.S_ISREG(st.st_mode) or st.st_nlink != 1:
                raise RuntimeError('SOURCE_FILE_UNSUPPORTED')
        db, wal, shm = descriptors
        # Nonblocking: a busy writer/checkpointer causes NO-GO, never a retry loop.
        for fd, start, length in [(db, 1073741826, 510), (shm, 128, 1), (shm, 120, 1), (shm, 121, 1), (shm, 122, 1)]:
            fcntl.lockf(fd, fcntl.LOCK_SH | fcntl.LOCK_NB, length, start, os.SEEK_SET)
        original = [os.fstat(fd) for fd in descriptors]
        header = os.pread(db, 100, 0)
        wh = os.pread(wal, 32, 0)
        sh = os.pread(shm, 96, 0)
        if len(header)!=100 or header[:16] != b'SQLite format 3\x00' or header[18:20] != b'\x02\x02':
            raise RuntimeError('WAL_DATABASE_REQUIRED')
        if len(wh) != 32 or int.from_bytes(wh[:4], 'big') not in [0x377f0682, 0x377f0683] or int.from_bytes(wh[4:8], 'big') != 3007000:
            raise RuntimeError('WAL_FORMAT_UNSUPPORTED')
        if len(sh) != 96 or sh[:48] != sh[48:96] or sh[12] != 1 or int.from_bytes(sh[:4], sys.byteorder) != 3007000:
            raise RuntimeError('WAL_INDEX_NOT_READY')
        page_size = int.from_bytes(header[16:18], 'big')
        page_size = 65536 if page_size == 1 else page_size
        frames = int.from_bytes(sh[16:20], sys.byteorder)
        pages = int.from_bytes(sh[20:24], sys.byteorder)
        wal_size = 32 + frames * (24 + page_size)
        if frames < 1 or pages < 1 or original[1].st_size < wal_size or sh[32:40] != wh[16:24] or int.from_bytes(wh[8:12], 'big') != page_size:
            raise RuntimeError('WAL_CAPTURE_BOUNDARY_UNCONFIRMED')
        last = os.pread(wal, 24, wal_size - page_size - 24)
        if len(last)!=24 or int.from_bytes(last[4:8], 'big')!=pages or last[8:16]!=wh[16:24]:
            raise RuntimeError('WAL_COMMIT_UNCONFIRMED')
        if sum(st.st_size for st in original[:2]) > 256 * 1024**2:
            raise RuntimeError('CAPTURE_TOO_LARGE_FOR_SHORT_LOCK')
        os.mkdir(target, 0o700)
        for fd, suffix in [(db, ''), (wal, '-wal')]:
            dest = os.open(os.path.join(target, 'rooms.sqlite' + suffix), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            try:
                remaining = wal_size if suffix == '-wal' else os.fstat(fd).st_size
                offset = 0
                while remaining:
                    if time.monotonic() - started > 1.0:
                        raise RuntimeError('CAPTURE_DEADLINE')
                    chunk = os.pread(fd, min(1024*1024, remaining), offset)
                    if not chunk:
                        raise RuntimeError('SOURCE_CHANGED')
                    view = memoryview(chunk)
                    while view:
                        n = os.write(dest, view)
                        view = view[n:]
                    remaining -= len(chunk)
                    offset += len(chunk)
            finally:
                os.close(dest)
        # Readers may update SHM read marks. Only DB/WAL must remain frozen.
        for index, fd in enumerate(descriptors):
            a, b = original[index], os.fstat(fd)
            c = b if inherited else os.stat(source + ['', '-wal', '-shm'][index], follow_symlinks=False)
            if (a.st_dev, a.st_ino) != (c.st_dev, c.st_ino) or (index < 2 and (a.st_size, a.st_mtime_ns) != (b.st_size, b.st_mtime_ns)):
                raise RuntimeError('SOURCE_CHANGED')
        return {'status': 'PASS', 'method': 'unix-wal-posix-read-lock-copy', 'sourceSqliteOpened': False, 'sourceDescriptorsReadOnly': True, 'shmCopied': False, 'expectedWalFrames': frames, 'expectedPageCount': pages}
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        for fd in reversed(descriptors):
            os.close(fd)

if __name__ == '__main__':
    try:
        if len(sys.argv) not in (3,4) or (len(sys.argv)==4 and sys.argv[3]!='--inherited'):
            raise RuntimeError('CAPTURE_ARGUMENTS')
        print(json.dumps(capture(sys.argv[1], sys.argv[2], len(sys.argv)==4)))
    except BaseException:
        print('{"status":"NO-GO","reason":"READ_ONLY_CAPTURE_UNAVAILABLE"}')
        sys.exit(2)
