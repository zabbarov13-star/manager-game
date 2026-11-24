/* Local presentation only: never a game command or an AnimationEvent on the wire. */
(()=>{'use strict';
 const themes=['heritage','arcade','studio','velvet','aurora'];
 const phases={walk:340,stop:420,land:480,card:850};
 function gait(theme,phase,p){
  const t=Math.max(0,Math.min(1,p)),a=t*Math.PI*2,w=Math.sin(a),h=Math.sin(t*Math.PI);
  let x=0,y=0,r=0,sx=1,sy=1;
  // Distinct rhythms: surveying, confident stride, heels, dash, garden sway,
  // robot steps, levitation, asymmetric peg-leg, heavy tread, skip, pivot, glitch.
  switch(theme){
   case 'blueprint':x=w*2;y=-Math.abs(w)*3;r=Math.sin(a+.8)*.012;break;
   case 'deal':x=w*4;y=-Math.abs(Math.sin(a*2))*5;r=w*.035;break;
   case 'crown':x=Math.sin(a)*2;y=-Math.pow(Math.max(0,w),2)*7;r=Math.sin(a*2)*.018;break;
   case 'hologram':x=Math.sin(a)*7;y=-(Math.sin(t*Math.PI)**2)*5;r=-w*.055;sx=1-h*.025;break;
   case 'garden':x=Math.sin(a)*5;y=-Math.abs(Math.sin(a/2))*3;r=Math.sin(a-.6)*.028;break;
   case 'robot':x=Math.round(w*2)*1.5;y=-(Math.floor(t*4)%2)*4;r=Math.sign(w)*.018;break;
   case 'crypto':x=Math.sin(a)*3;y=-7-Math.sin(a)*4;r=Math.sin(a/2)*.012;break;
   case 'pirate':x=w*4;y=-Math.max(0,w)*8;r=(w>0?w*.05:w*.015);break;
   case 'cash':x=w;y=-Math.abs(Math.sin(a))*2;sy=1-Math.max(0,w)*.025;r=Math.sin(a)*.025;break;
   case 'phone':x=w*6;y=-Math.max(0,Math.sin(a*2))*9;r=w*.045;break;
   case 'restaurant':x=Math.sin(a)*3;y=-Math.abs(w)*4;r=Math.sin(a)*.025;sx=1-h*.04;break;
   case 'matrix':x=(Math.floor(t*10)%3-1)*3;y=-Math.max(0,w)*2;r=0;break;
  }
  if(phase==='stop'){const settle=(1-t)**2;x*=settle;y*=settle;r*=settle;sx=1+(sx-1)*settle;sy=1+(sy-1)*settle;}
  if(phase==='land'){x*=1-t;y=Math.max(0,Math.sin(t*Math.PI))*4;r*=1-t;sy=1-h*.035;}
  if(phase==='card'){x*=.35;y*=.35;r+=h*(theme==='matrix'?-.07:theme==='crown'?.045:-.025);}
  return {x,y,r,sx,sy};
 }
 function actorLook(actorId,room){
  const seat=room?.seats?.find(s=>s.id===actorId);
  // Old peers without verified appearance metadata use the classic presentation.
  return {theme:themes.includes(seat?.cosmeticStyle)?seat.cosmeticStyle:'heritage',dice:seat?.cosmeticDice==='jade'?'jade':''};
 }
 function dice(node,look={}){node.dataset.look=themes.includes(look.theme)?look.theme:'heritage';node.dataset.dice=look.dice==='jade'?'jade':'';}
 function localLook(player,look){return player?.id==='p0'&&player.kind!=='bot'?look:{theme:'heritage',dice:''};}
 function notify(playerId,phase){if(phases[phase]&&typeof playerId==='string')document.dispatchEvent(new CustomEvent('manager:motion',{detail:{playerId,phase}}));}
 window.ManagerMotion={gait,phases,actorLook,localLook,dice,notify};
})();
