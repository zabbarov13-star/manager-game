const fs = require('node:fs');
const path = require('node:path');

module.exports = function boardControls(replace) {
  const asset = fs.readFileSync(path.join(__dirname, 'board-controls.js'), 'utf8');
  replace("function mountBoardPan(", asset + "\nfunction mountBoardPan(");
  replace("mountBoardPan($('board-viewport'),{camera});",
    "mountBoardPan($('board-viewport'),{camera});mountBoardZoom($('board-viewport'),{camera,getZoom:()=>zoom,setZoom});");
  replace("function setZoom(value){zoom=Math.max(.5,Math.min(2.5,value));$('board-stage').style.width=zoom*100+'%';$('board-viewport').classList.toggle('is-zoomed',zoom>=.75);camera.stop();",
    "function setZoom(value,anchor,from){camera.stop();const viewport=$('board-viewport'),stage=$('board-stage');zoomBoardAt(viewport,stage,()=>{zoom=clampBoardZoom(value);stage.style.width=zoom*100+'%';viewport.classList.toggle('is-zoomed',zoom>=.75);stage.style.setProperty('--camera-view-width',viewport.clientWidth+'px');stage.style.setProperty('--camera-view-height',viewport.clientHeight+'px');},anchor,from);");
  // A manual pan pauses following; a new movement resumes it if the setting is on.
  replace('return {focus,stop,hold(ms=1500)', 'return {focus,stop,resume(){manualUntil=0;},hold(ms=1500)');
  replace("if(first){moveHand(first.playerId,before[first.playerId]);",
    "if(first){camera?.resume();moveHand(first.playerId,before[first.playerId]);");
  replace('async function animate(effects,before){',
    `function selectArrival(effects){
  const last=effects.findLast(effect=>effect.path?.length);
  if(!last)return;
  const cell=last.path.at(-1);
  setSelected(cell);
  if(s.buildVisit?.cell===cell&&!s.buildVisit.used&&(!online.active||online.seatId===last.playerId))showTab('cell');
 }
 async function animate(effects,before){`);
  replace("if(animationEpoch===epoch){let follow=first?s.players.find(p=>p.id===first.playerId):current();if(follow?.out)follow=s.players.find(p=>!p.out);if(follow)focusFigure(follow.id,follow.position);}",
    "if(animationEpoch===epoch){selectArrival(effects);const last=effects.findLast(effect=>effect.path?.length);if(last)focusFigure(last.playerId,last.path.at(-1));}");
  replace('if(stamp!==epoch)return;busy=false;setSelected(current().position);render();',
    'if(stamp!==epoch)return;busy=false;render();');
  replace('busy=false;displayPositions=null;hand.hidden=true;setSelected(current().position);render();',
    'busy=false;displayPositions=null;hand.hidden=true;if(first)setSelected(current().position);render();');
  replace("for(const id of moveSteps(state.position,sum)){", "camera.resume();for(const id of moveSteps(state.position,sum)){");
  replace('</head>', `<style>
#board-viewport,#board-viewport :is(button,svg,img){touch-action:pan-x pan-y}
#board .tile.selected .tile-bg{stroke:#0b4165;stroke-width:5}
</style></head>`);
};
