'use strict';
const fs=require('node:fs'),path=require('node:path');
function sandboxArgs(folder,node,worker){
 const args=['--unshare-all','--unshare-user','--disable-userns','--die-with-parent','--new-session','--cap-drop','ALL','--uid','65534','--gid','65534','--clearenv','--setenv','PATH','/usr/bin:/bin','--setenv','HOME','/tmp','--setenv','NODE_NO_WARNINGS','1','--ro-bind','/usr','/usr'];
 for(const p of ['/bin','/lib','/lib64'])if(fs.existsSync(p)){const st=fs.lstatSync(p);args.push(...(st.isSymbolicLink()?['--symlink',fs.readlinkSync(p),p]:['--ro-bind',p,p]));}
 const adapterProbe=path.join(path.dirname(worker),'preflight-adapter.cjs');if(fs.existsSync(adapterProbe))args.push('--ro-bind',adapterProbe,'/adapter-probe.cjs');
 args.push('--proc','/proc','--dev','/dev','--tmpfs','/tmp','--dir','/runtime','--ro-bind',node,'/runtime/node','--ro-bind',worker,'/worker.cjs','--bind',folder,'/audit','--chdir','/audit','/usr/bin/setpriv','--no-new-privs','/runtime/node','--max-old-space-size=256','/worker.cjs');return args;
}
module.exports={sandboxArgs};
