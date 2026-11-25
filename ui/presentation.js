/* Presentation paths never change authoritative positions, income or landing effects. */
(()=>{'use strict';
 function movementPath(effect,from,cardMove=false){
  const path=effect?.path;
  if(!cardMove||effect.teleport||!Array.isArray(path)||!path.length||!Number.isInteger(from)||from<0||from>=40||path.some(n=>!Number.isInteger(n)||n<0||n>=40))return path??[];
  const to=path.at(-1),forward=(to-from+40)%40,backward=(from-to+40)%40;
  // A full circuit is a real movement, even when its endpoint equals its origin.
  if(!forward)return path;
  const direction=forward<backward?1:backward<forward?-1:path[0]===(from+1)%40?1:-1;
  const count=direction===1?forward:backward;
  return Array.from({length:count},(_,i)=>(from+direction*(i+1)+40)%40);
 }
 window.ManagerPresentation={movementPath};
})();
