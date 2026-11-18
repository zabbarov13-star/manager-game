#!/usr/bin/env python3
"""Trusted root FD broker. Detached readonly mount only: no host mount changes.
No SQL, no application code, no writes to source files. Execs fixed bwrap.
"""
import ctypes, fcntl, json, os, platform, stat, sys

class MountAttr(ctypes.Structure):
    _fields_ = [(name, ctypes.c_uint64) for name in ('attr_set', 'attr_clr', 'propagation', 'userns_fd')]

def execute(source, inventory, command):
    if os.geteuid()!=0 or platform.machine() not in ('x86_64','aarch64') or command[0]!='/usr/bin/bwrap':
        raise RuntimeError('BROKER_PREREQUISITES')
    with open(inventory, 'r') as file:
        host=json.load(file)
    if source!=host['expected']['database'] or os.path.realpath(source)!=source:
        raise RuntimeError('BROKER_SOURCE_MISMATCH')
    libc=ctypes.CDLL(None, use_errno=True)
    libc.syscall.restype=ctypes.c_long
    # Linux x86_64/aarch64: open_tree(428), mount_setattr(442).
    tree=libc.syscall(428, ctypes.c_int(-100), ctypes.c_char_p(os.fsencode(os.path.dirname(source))), ctypes.c_uint(1|os.O_CLOEXEC))
    if tree<0:
        raise RuntimeError('DETACHED_READONLY_MOUNT_UNAVAILABLE')
    try:
        # RDONLY | NOSUID | NODEV | NOEXEC; changes only the detached clone.
        attr=MountAttr(15,0,0,0)
        if libc.syscall(442,ctypes.c_int(tree),ctypes.c_char_p(b''),ctypes.c_uint(0x1000),ctypes.byref(attr),ctypes.c_size_t(ctypes.sizeof(attr)))!=0:
            raise RuntimeError('DETACHED_READONLY_MOUNT_UNAVAILABLE')
        saved=[]
        for index,suffix in enumerate(('', '-wal', '-shm')):
            fd=os.open(os.path.basename(source)+suffix,os.O_RDONLY|os.O_NOFOLLOW|os.O_NOATIME|os.O_NONBLOCK,dir_fd=tree)
            try:
                st=os.fstat(fd)
                if not stat.S_ISREG(st.st_mode) or st.st_nlink!=1 or [st.st_dev,st.st_ino]!=[host['sourceInodes'][index]['dev'],host['sourceInodes'][index]['ino']] or not os.fstatvfs(fd).f_flag&os.ST_RDONLY:
                    raise RuntimeError('SOURCE_IDENTITY_OR_READONLY_MOUNT_INVALID')
                saved.append(fcntl.fcntl(fd,fcntl.F_DUPFD_CLOEXEC,10))
            finally:
                os.close(fd)
    finally:
        os.close(tree)
    for index,fd in enumerate(saved):
        os.dup2(fd,3+index,inheritable=True)
    for fd in saved:
        os.close(fd)
    os.execv(command[0],command)

if __name__=='__main__':
    try:
        execute(sys.argv[1],sys.argv[2],sys.argv[3:])
    except BaseException:
        print('NO-GO: detached read-only source descriptors unavailable.',file=sys.stderr)
        sys.exit(2)
