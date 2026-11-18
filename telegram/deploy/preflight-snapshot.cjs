'use strict';
// Trusted, time-bounded child; no application code is loaded here.
const fs=require('node:fs'),path=require('node:path'),{snapshotRoom}=require('./preflight.cjs');
if(require.main===module){const [source,folder]=process.argv.slice(2);if(process.platform!=='linux'||process.getuid()!==65534||source!=='/audit/captured/rooms.sqlite'||folder!=='/audit/backup')process.exitCode=2;else snapshotRoom(source,folder).then(result=>fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify(result,null,2),{mode:0o600})).catch(()=>{process.exitCode=2;});}
