/* Character rigs and effects use Canvas 2D exclusively. No game input is read or mutated. */
(() => {
  'use strict';
  const visualEvent=event=>event.type.startsWith('visual.');
  const TAU=Math.PI*2,clamp=value=>Math.max(0,Math.min(1,value));
  const labels={'character.spawn':'Появление','character.idle':'Ожидание','turn.started':'Начало хода','dice.rolled':'Бросок','property.purchased':'Покупка','money.received':'Доход','money.lost':'Расход','game.won':'Победа','game.lost':'Поражение'};
  const palettes={blueprint:'#45bca9',deal:'#edb95f',crown:'#e3c05f',hologram:'#53d8ff',garden:'#77c976',robot:'#c6a2fa',crypto:'#58f090',pirate:'#efc066',cash:'#e6b642',phone:'#f5c841',restaurant:'#ed7c6c',matrix:'#43f997'};
  const poseFor=type=>type==='game.won'?'win':type==='game.lost'?'loss':type==='money.lost'?'failure':['property.purchased','money.received','turn.started'].includes(type)?'joy':'idle';
  const line=(ctx,points,color,width=2)=>{ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();};
  const circle=(ctx,x,y,r,color,fill=false)=>{ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx[fill?'fillStyle':'strokeStyle']=color;ctx[fill?'fill':'stroke']();};
  const text=(ctx,value,x,y,color,size=15)=>{ctx.fillStyle=color;ctx.font=`700 ${size}px system-ui,sans-serif`;ctx.textAlign='center';ctx.fillText(value,x,y);};
  function coin(ctx,x,y,r,color){circle(ctx,x,y,r,color,true);circle(ctx,x,y,r*.72,'#fff1ad');line(ctx,[[x-r*.2,y-r*.4],[x-r*.2,y+r*.4],[x+r*.25,y+r*.25],[x-r*.2,y]],'#795c26',1.6);}
  function crown(ctx,x,y,s,color){ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(x-s,y+s*.4);ctx.lineTo(x-s*1.15,y-s*.7);ctx.lineTo(x-s*.35,y-s*.1);ctx.lineTo(x,y-s);ctx.lineTo(x+s*.35,y-s*.1);ctx.lineTo(x+s*1.15,y-s*.7);ctx.lineTo(x+s,y+s*.4);ctx.closePath();ctx.fill();line(ctx,[[x-s,y+s*.65],[x+s,y+s*.65]],'#fff2bd',3);}
  function graph(ctx,x,y,w,h,p,color){ctx.save();ctx.translate(x,y);ctx.fillStyle='#062029c9';ctx.fillRect(0,0,w,h);ctx.strokeStyle=color;ctx.lineWidth=1;ctx.strokeRect(0,0,w,h);for(let i=1;i<4;i++)line(ctx,[[0,h*i/4],[w,h*i/4]],color+'55',.6);const points=[[5,h-8],[w*.23,h*.67],[w*.43,h*.73],[w*.67,h*.35],[w-7,8]];ctx.beginPath();points.forEach(([px,py],i)=>{if(i/4<=p)i?ctx.lineTo(px,py):ctx.moveTo(px,py);});ctx.strokeStyle=color;ctx.lineWidth=3;ctx.stroke();ctx.restore();}
  function stamp(ctx,label,p,color){ctx.save();ctx.globalAlpha=clamp(p*5);ctx.translate(180,363);ctx.rotate(-.12);ctx.strokeStyle=color;ctx.lineWidth=3;ctx.strokeRect(-115,-23,230,46);text(ctx,label,0,6,color,label.length>15?15:21);ctx.restore();}
  function building(ctx,x,y,p,color,restaurant=false){const h=90*clamp(p*1.4);ctx.fillStyle='#152e42';ctx.fillRect(x-40,y-h,80,h);ctx.strokeStyle=color;ctx.lineWidth=2;ctx.strokeRect(x-40,y-h,80,h);for(let row=0;row<4;row++)for(let col=0;col<3;col++){ctx.fillStyle=color;ctx.fillRect(x-28+col*21,y-h+12+row*17,10,8);}if(restaurant){ctx.fillStyle='#d8494e';ctx.fillRect(x-48,y-h,96,18);for(let i=0;i<6;i++){ctx.fillStyle=i%2?'#fff2ce':'#d8494e';ctx.fillRect(x-48+i*16,y-h,16,18);}text(ctx,'CAFÉ',x,y-h-7,color,13);}else line(ctx,[[x,y-h],[x,y-h-22]],color,3);}
  function plant(ctx,x,y,p,color,money=false){ctx.save();ctx.translate(x,y);const growth=clamp(p*1.4);ctx.scale(1,growth);ctx.strokeStyle=color;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(0,0);ctx.bezierCurveTo(-10,-30,13,-50,0,-95);ctx.stroke();for(let i=0;i<5;i++){const yy=-18-i*15,xx=i%2?15:-15;ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(xx*.6,yy,13,5,i%2?-.5:.5,0,TAU);ctx.fill();if(money)coin(ctx,xx,yy-8,7,'#e6c05b');}if(!money){for(let i=0;i<5;i++)circle(ctx,Math.cos(i/5*TAU)*8,-101+Math.sin(i/5*TAU)*8,7,'#f4bad1',true);circle(ctx,0,-101,5,'#f6d366',true);}ctx.restore();}
  function robot(ctx,x,y,t,color){ctx.save();ctx.translate(x,y+Math.sin(t*TAU)*5);ctx.fillStyle='#ecedfa';ctx.beginPath();ctx.roundRect(-24,-22,48,40,11);ctx.fill();ctx.fillStyle='#303447';ctx.fillRect(-16,-13,32,19);circle(ctx,-8,-3,3,color,true);circle(ctx,8,-3,3,color,true);line(ctx,[[-12,26],[-20,5]],color,3);line(ctx,[[12,26],[20,5]],color,3);circle(ctx,0,29,8,'#b9b6db',true);ctx.restore();}
  function drone(ctx,x,y,t){ctx.save();ctx.translate(x,y+Math.sin(t*TAU)*8);ctx.rotate(Math.sin(t*TAU)*.08);ctx.fillStyle='#d66b4c';ctx.beginPath();ctx.ellipse(0,0,15,22,0,0,TAU);ctx.fill();ctx.fillStyle='#f1c44f';ctx.beginPath();ctx.ellipse(5,-20,15,15,0,0,TAU);ctx.fill();ctx.fillStyle='#1d2633';ctx.beginPath();ctx.moveTo(14,-24);ctx.lineTo(29,-15);ctx.lineTo(13,-10);ctx.fill();circle(ctx,8,-23,3,'#222',true);line(ctx,[[-10,2],[-37,-10-Math.sin(t*TAU)*11]],'#59a6d7',6);line(ctx,[[12,2],[37,-10+Math.sin(t*TAU)*11]],'#59a6d7',6);ctx.restore();}
  function phone(ctx,x,y,t,color){ctx.save();ctx.translate(x,y);ctx.rotate(Math.sin(t*TAU)*.07);ctx.fillStyle='#172b3a';ctx.beginPath();ctx.roundRect(-22,-40,44,80,7);ctx.fill();graph(ctx,-16,-29,32,49,t,color);ctx.restore();}
  function coffee(ctx,x,y,t,color){ctx.fillStyle='#fff1db';ctx.fillRect(x-15,y-18,30,38);ctx.strokeStyle=color;ctx.lineWidth=3;ctx.strokeRect(x-15,y-18,30,38);circle(ctx,x+21,y-2,9,color);for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(x-10+i*10,y-25);ctx.bezierCurveTo(x-21+i*10,y-40-t*10,x+10+i*10,y-38,x-2+i*10,y-62);ctx.strokeStyle='#e9e4daaa';ctx.lineWidth=2;ctx.stroke();}}

  function motif(ctx,theme,p,type,color){
    if(type==='money.lost'||type==='game.lost'){negativeMotif(ctx,theme,p,type,color);return;}
    const purchase=type==='property.purchased',win=type==='game.won',t=p,action=clamp(p*1.8);
    ctx.save();ctx.shadowBlur=10;ctx.shadowColor=color;
    switch(theme){
      case 'blueprint':
        ctx.save();ctx.translate(82,280);ctx.rotate(Math.sin(t*TAU)*.1);ctx.fillStyle='#d8efe5';ctx.fillRect(-30,-24,75,52);for(let i=0;i<4;i++)line(ctx,[[-23,-16+i*12],[38,-16+i*12]],'#3f8d92',1);ctx.restore();
        if(purchase||win){building(ctx,260,330,action,color);building(ctx,213,330,clamp((action-.2)*1.3),color);}
        break;
      case 'deal':
        circle(ctx,264,238-Math.sin(t*Math.PI)*25,23,'#dfb469',true);ctx.save();ctx.translate(264,238-Math.sin(t*Math.PI)*25);ctx.rotate(t*TAU);line(ctx,[[0,-17],[0,17]],'#f6ede2',3);line(ctx,[[-13,0],[13,0]],'#77492d',2);ctx.restore();
        if(purchase||win){ctx.globalAlpha=.25;ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(250,240);ctx.lineTo(55,380);ctx.lineTo(310,380);ctx.fill();ctx.globalAlpha=1;stamp(ctx,'СДЕЛКА ЗАКЛЮЧЕНА',action,color);}break;
      case 'crown':
        ctx.save();ctx.translate(270,215);ctx.rotate(t*TAU);line(ctx,[[0,-38],[0,38]],color,4);circle(ctx,0,-41,5,'#fff3c2',true);ctx.restore();if(purchase||win)crown(ctx,180,84,35*action,color);break;
      case 'hologram':
        graph(ctx,225,175,95,72,action,color);graph(ctx,42,272,80,50,clamp(p*2-.2),color);ctx.globalAlpha=.7;circle(ctx,180,365,25+60*p,color);if(purchase)stamp(ctx,'ОБЪЕКТ ПОДКЛЮЧЁН',action,color);break;
      case 'garden':plant(ctx,270,350,action,color,purchase||win);if(win)plant(ctx,70,365,clamp(p*2-.3),'#b9dc91',true);break;
      case 'robot':robot(ctx,270,198,t,color);graph(ctx,230,252,92,56,action,color);if(purchase||win){line(ctx,[[227,213],[90+180*p,335]],color,3);stamp(ctx,'INVESTED',action,color);}break;
      case 'crypto':
        ctx.beginPath();ctx.ellipse(180,101,51+5*Math.sin(t*TAU),16,0,0,TAU);ctx.strokeStyle=color;ctx.lineWidth=5;ctx.stroke();coin(ctx,278,230-Math.sin(t*TAU)*12,23,'#e9c05f');graph(ctx,45,310,85,60,action,color);if(purchase||win)graph(ctx,235,300,83,65,action,color);break;
      case 'pirate':drone(ctx,277+Math.sin(t*TAU)*11,148,t);if(purchase||win)stamp(ctx,'СОБСТВЕННОСТЬ',action,color);break;
      case 'cash':
        for(let i=0;i<7;i++){const flight=(p+i*.13)%1;ctx.save();ctx.translate(270+Math.sin(i*2.4)*75*flight,280-flight*(purchase||win?180:40));ctx.rotate(Math.sin(i+flight*4));ctx.fillStyle='#d8d2a5';ctx.fillRect(-16,-7,32,14);line(ctx,[[-10,0],[10,0]],'#829365',2);ctx.restore();}break;
      case 'phone':phone(ctx,267,218,t,color);if(purchase||win){ctx.save();ctx.translate(278,122-25*p);ctx.fillStyle='#f5cb68';ctx.beginPath();ctx.moveTo(-14,4);ctx.lineTo(-6,-17);ctx.lineTo(3,-17);ctx.lineTo(3,-2);ctx.lineTo(21,-2);ctx.lineTo(15,20);ctx.lineTo(-13,20);ctx.fill();ctx.restore();stamp(ctx,'НОВАЯ ИДЕЯ',action,color);}break;
      case 'restaurant':coffee(ctx,270,220,t,color);graph(ctx,42,265,75,52,action,'#8ddaa8');if(purchase||win)building(ctx,260,360,action,color,true);break;
      case 'matrix':
        for(let column=0;column<9;column++){const x=40+column*34,y=75+(p*220+column*29)%285;text(ctx,String((column*7+Math.floor(p*10))%10),x,y,color,16);text(ctx,'01',x,y-20,color+'88',10);}
        // The approved raster already contains the mask and keyboard. Animate
        // their light/code instead of painting a second face and floating keyboard.
        ctx.globalAlpha=.35+.25*Math.sin(t*TAU);line(ctx,[[122,242],[238,242]],color,2);ctx.globalAlpha=1;if(purchase)stamp(ctx,'ACCESS CONFIRMED',action,color);break;
    }
    ctx.restore();
  }

  // Losses have their own character-specific prop choreography: no growing
  // money tree, rising quote or celebration remains behind a disappointed pose.
  function negativeMotif(ctx,theme,p,type,color){
    const final=type==='game.lost',fade=final?1-.65*p:1,t=p*TAU;ctx.save();ctx.globalAlpha=fade;
    switch(theme){
      case 'blueprint':ctx.save();ctx.translate(80,285+12*p);ctx.rotate(-.25*p);ctx.fillStyle='#d8efe5';ctx.fillRect(-26,-24,65*(1-.45*p),48);line(ctx,[[-18,-14],[23,-14],[23,12]],color,2);ctx.restore();break;
      case 'deal':circle(ctx,270,225+50*p,23,'#b49360',true);line(ctx,[[270,215+50*p],[260+8*Math.sin(t),243+50*p]],'#fff0c9',3);line(ctx,[[44,340],[90,320],[117,354]],color,3);break;
      case 'crown':ctx.save();ctx.translate(270,245+20*p);ctx.rotate(.3+p*.4);line(ctx,[[0,-35],[0,35]],color,4);ctx.restore();if(final){ctx.globalAlpha*=.5;crown(ctx,180,80+20*p,23,color);}break;
      case 'hologram':ctx.translate(0,20*p);graph(ctx,230,210,85,65,1-p,color);line(ctx,[[236,225],[260,235],[277,235],[304,260]],'#ee9f91',3);break;
      case 'garden':ctx.save();ctx.translate(270,350);ctx.rotate(.38*p);plant(ctx,0,0,1-p*.45,'#b8b58a',false);ctx.restore();break;
      case 'robot':robot(ctx,270,205+30*p,p*.3,'#efba83');graph(ctx,231,285,85,48,1-p,color);break;
      case 'crypto':ctx.globalAlpha*=.8;ctx.beginPath();ctx.ellipse(180,100,52-p*8,15,0,0,TAU);ctx.strokeStyle=color;ctx.lineWidth=3;ctx.stroke();coin(ctx,278,225+75*p,19-p*5,'#cfb56c');line(ctx,[[47,310],[72,326],[96,320],[123,354]],color,3);break;
      case 'pirate':drone(ctx,285-45*p,160+110*p,p*.3);line(ctx,[[240,335],[290,335]],color,2);break;
      case 'cash':for(let i=0;i<5;i++){ctx.fillStyle='#b5b89a';ctx.fillRect(233+i*13,230+p*50-i*10,25,12);}break;
      case 'phone':phone(ctx,267,220+12*p,p*.25,color);text(ctx,final?'НОВАЯ ПОПЫТКА':'ПЕРЕСЧЁТ',180,375,color,17);break;
      case 'restaurant':coffee(ctx,270,245+20*p,.15,color);line(ctx,[[47,280],[66,287],[88,304],[115,307]],'#dfa296',3);break;
      case 'matrix':for(let i=0;i<7;i++)text(ctx,'010',50+i*43,90+(p*260+i*24)%300,color,12);line(ctx,[[122,242],[238,242]],color,2);if(final)text(ctx,'ПЕРЕЗАПУСК',180,380,color,15);break;
    }ctx.restore();
  }

  const motions={blueprint:[-1,5,.018],deal:[1,9,.027],crown:[-1,4,.012],hologram:[1,6,.018],garden:[-1,5,.016],robot:[1,8,.024],crypto:[-1,12,.009],pirate:[1,7,.025],cash:[-1,4,.022],phone:[1,11,.035],restaurant:[-1,6,.02],matrix:[1,5,.011]};

  class CharacterCanvasRenderer {
    constructor(canvas,character,options={}){this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:true});this.character=character;this.images=new Map();this.ready=null;this.frame=null;this.options=options;this.metrics={frames:0,lastFrameMs:0};canvas.width=360;canvas.height=480;canvas.setAttribute('aria-label',character.name+' · двумерная анимация');}
    load(){return this.ready??=(async()=>{for(const state of ['idle','joy','failure','win','loss']){const image=new Image();image.src=this.character.poses?.[state]??this.character.sprite;await image.decode();this.images.set(state,image);}})();}
    renderFrame(event,p){
      const started=performance.now(),ctx=this.ctx,theme=this.character.theme,color=palettes[theme]??'#d6bd77';ctx.clearRect(0,0,360,480);p=clamp(p);
      const visual=event.type.startsWith('visual.'),phase=event.type.slice(7);let state=poseFor(event.type);const focus=event.type==='character.idle'&&theme==='blueprint';if(focus)state='failure';
      const image=this.images.get(state)??this.images.get('idle');if(!image)return;
      const maxWidth=270,maxHeight=405,scale=Math.min(maxWidth/image.width,maxHeight/image.height),w=image.width*scale,h=image.height*scale,x=(360-w)/2,y=442-h;
      // Keep approved anatomy intact. Blend separately drawn poses instead of
      // cutting an arbitrary line through the face/neck; props remain independent.
      const [direction,lift,angle]=motions[theme]??motions.blueprint,spawn=event.type==='character.spawn',idle=event.type==='character.idle',final=event.type.startsWith('game.'),wave=Math.sin(p*Math.PI),ease=1-Math.pow(1-p,3);
      const motion=visual?window.ManagerMotion.gait(theme,phase,p):{x:0,y:0,r:0,sx:1,sy:1};this.options.onMotion?.(motion);ctx.save();ctx.translate(motion.x,motion.y);ctx.translate(180,442);ctx.rotate(motion.r);ctx.scale(motion.sx,motion.sy);ctx.translate(-180,-442);ctx.translate(direction*(spawn?(1-ease)*55:Math.sin(p*TAU)*(idle?1:3)),spawn?(1-ease)*25:-wave*lift*(final?1.35:idle?.25:.6));ctx.translate(180,430);ctx.rotate(Math.sin(p*TAU)*angle*(idle?.3:1));ctx.translate(-180,-430);ctx.globalAlpha=spawn?ease:1;
      const blend=focus?Math.pow(Math.sin(p*Math.PI),8):state==='idle'?1:clamp(p*5),base=this.images.get('idle');
      if(blend<1&&base){ctx.save();ctx.globalAlpha*=1-blend;ctx.drawImage(base,x,y,w,h);ctx.restore();}
      ctx.globalAlpha*=blend;ctx.drawImage(image,x,y,w,h);ctx.restore();
      ctx.save();if(spawn)ctx.globalAlpha=ease;motif(ctx,theme,p,event.type,color);ctx.restore();
      if(event.type==='turn.started'){ctx.globalAlpha=Math.sin(p*Math.PI);circle(ctx,180,427,100,color);ctx.globalAlpha=1;}
      if(event.type==='dice.rolled'&&this.options.showDice!==false)event.diceValues.forEach((value,index)=>{const dx=125+index*75,dy=365-Math.sin(p*Math.PI)*20;ctx.save();ctx.translate(dx,dy);ctx.rotate(Math.sin(p*TAU)*.3);ctx.fillStyle='#fff3d4';ctx.beginPath();ctx.roundRect(-23,-23,46,46,8);ctx.fill();text(ctx,String(value),0,8,'#17384d',25);ctx.restore();});
      if(event.type==='money.received'||event.type==='money.lost'){const income=event.type==='money.received';text(ctx,(income?'+':'−')+event.amount,180,56+(income?-20:20)*p,income?'#75da9b':'#ef9e8e',26);for(let i=0;i<5;i++)coin(ctx,60+i*60,100+(income?-1:1)*60*p+(i%2)*15,7,color);}
      if(event.type==='game.won'){for(let i=0;i<22;i++){const a=i*2.4,r=35+115*p;coin(ctx,180+Math.cos(a)*r,210+Math.sin(a)*r-50*p,3+(i%4),i%2?color:'#f4d26d');}}
      if(event.type==='game.lost'){ctx.fillStyle='#203b5140';ctx.fillRect(0,0,360,480);text(ctx,'Ещё одна история впереди',180,463,'#d1dce0',15);}
      this.metrics.frames++;this.metrics.lastFrameMs=performance.now()-started;
    }
    async play(event,signal){
      await this.load();if(signal.aborted)return;
      return new Promise(resolve=>{const duration=window.ManagerAnimationCore.durations[event.type]??window.ManagerMotion.phases[event.type.slice(7)],start=performance.now(),reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;let last=-Infinity,done=false;
        let timer;const finish=()=>{if(done)return;done=true;clearTimeout(timer);cancelAnimationFrame(this.frame);signal.removeEventListener('abort',abort);resolve();};
        const abort=()=>{this.options.onMotion?.({x:0,y:0,r:0,sx:1,sy:1});this.ctx.clearRect(0,0,360,480);finish();};signal.addEventListener('abort',abort,{once:true});
        if(reduce){this.renderFrame(visualEvent(event)?{type:'character.idle'}:event,1);timer=setTimeout(finish,duration);return;}
        // rAF timestamps can be a fraction below 33.333 ms. A small tolerance
        // prevents accidentally skipping a third refresh and dropping to ~23 fps.
        const tick=now=>{if(signal.aborted)return abort();const progress=clamp((now-start)/duration);if(now-last>=1000/30-.25||progress===1){this.renderFrame(event,progress);last=now;}if(progress<1)this.frame=requestAnimationFrame(tick);else finish();};
        this.frame=requestAnimationFrame(tick);
      });
    }
    cancel(){this.options.onMotion?.({x:0,y:0,r:0,sx:1,sy:1});cancelAnimationFrame(this.frame);this.ctx.clearRect(0,0,360,480);}
  }
  window.ManagerCharacterAnimation={CharacterCanvasRenderer,labels,poseFor};
})();
