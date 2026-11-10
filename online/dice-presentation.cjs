// Applied to the generated client after extracting the authoritative server engine.
module.exports = function dicePresentation(replace) {
  replace("const PACE={", "const diceReducedMotion=settings=>settings.reducedMotion||window.matchMedia('(prefers-reduced-motion: reduce)').matches;\nconst PACE={");
  replace("sum=values[0]+values[1],short=getSettings().reducedMotion;", "sum=values[0]+values[1],short=diceReducedMotion(getSettings());");
  replace("sum=values[0]+values[1],short=state.settings.reducedMotion;", "sum=values[0]+values[1],short=diceReducedMotion(state.settings);");
  replace("classList.toggle('rolling',!getSettings().reducedMotion);sound.roll(getSettings().reducedMotion);",
    "classList.toggle('rolling',!short);sound.roll(short);");
  replace("if(t.rolls>oldRolls&&t.dice){camera", "if(t.rolls>oldRolls&&t.dice){const short=diceReducedMotion(getSettings());camera");
  replace("await wait(getSettings().reducedMotion?50:PACE.diceHold);", "await wait(short?50:PACE.diceHold);");
  replace(" roll(short=false){if(!this.ctx)return;this.duck(short?.3:1.95);const hits=short?[0]:[0,.065,.16,.24,.37,.50,.67,.85,1.08,1.33,1.62,1.77];hits.forEach((v,i)=>this.effect('dice',v,.24-i*.01,i%2?.25:-.25));}",
    ` roll(short=false){
  const context=this.ctx;
  if(context?.state!=='running'||!this.settings?.sfxOn||!this.settings.sfx||this.diceSource||document.hidden)return;
  // Leave room for audio output latency before the last visual bounce.
  const visualSeconds=short?.1:PACE.dice/1000;
  const budget=visualSeconds-(context.baseLatency??0)-(context.outputLatency??0)-.028;
  if(budget<.035)return;
  const duration=Math.min(short?.072:.73,budget),rate=context.sampleRate;
  const hits=short?[0]:[0,.23,.44,.63,.77];
  const buffer=context.createBuffer(1,Math.floor(rate*duration),rate),mix=buffer.getChannelData(0);
  for(let i=0;i<hits.length;i++){
   const offset=Math.floor(hits[i]*mix.length),next=Math.floor((hits[i+1]??1)*mix.length);
   const pcm=effectPCM('dice',rate,Math.floor(Math.random()*0xffffffff));
   const length=Math.min(pcm.length,next-offset),fade=Math.max(1,Math.round(rate*.018));
   for(let j=0;j<length;j++)mix[offset+j]=pcm[j]*(.24-i*.022)*Math.min(1,(length-1-j)/fade);
  }
  const source=context.createBufferSource();source.buffer=buffer;source.connect(this.fx);
  this.diceSource=source;
  source.onended=()=>{source.disconnect();if(this.diceSource===source)this.diceSource=null;};
  this.duck(duration+.09);
  source.start();
 }`);
  replace("$('dice-result').textContent=t.dice.join(' + ')+' = '+(t.dice[0]+t.dice[1]);", "$('dice-result').textContent='Бросаем…';");
  replace("await wait(getSettings().reducedMotion?100:PACE.dice);$('dice-tray').classList.remove('rolling');",
    "await wait(short?100:PACE.dice);if(epoch!==batchEpoch)return;$('dice-tray').classList.remove('rolling');$('dice-result').textContent=t.dice.join(' + ')+' = '+(t.dice[0]+t.dice[1]);");
};
