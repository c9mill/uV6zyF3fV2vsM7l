/* Anchored metallic wallpaper: positions never respond to time, scroll or pointer. */
(()=>{
 'use strict';
 const canvas=document.createElement('canvas');canvas.className='holographic-wallpaper';canvas.setAttribute('aria-hidden','true');document.body.prepend(canvas);
 const ctx=canvas.getContext('2d',{alpha:false});if(!ctx){canvas.remove();return;}
 const reduce=matchMedia('(prefers-reduced-motion: reduce)');
 const low=(navigator.hardwareConcurrency||4)<=4;
 const count=low?1100:1800,liveCount=low?160:280;
 const px=new Float32Array(count),py=new Float32Array(count),size=new Float32Array(count),phase=new Float32Array(count),tint=new Uint8Array(count);
 let seed=1743927;function random(){seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;}
 for(let i=0;i<count;i++){px[i]=random();py[i]=random();size[i]=random()<.86?.5+random()*.5:1.5+random()*.5;phase[i]=random()*Math.PI*2;tint[i]=(random()*4)|0;}
 // All gradients, colors and particle state are allocated outside the frame loop.
 const atlas=document.createElement('canvas');atlas.width=128;atlas.height=32;const ac=atlas.getContext('2d');
 const colors=['246,248,245','168,222,180','79,203,103','194,221,199'];
 for(let c=0;c<4;c++){const x=c*32+16,g=ac.createRadialGradient(x,16,0,x,16,15);g.addColorStop(0,'rgba('+colors[c]+',1)');g.addColorStop(.13,'rgba('+colors[c]+',.8)');g.addColorStop(.4,'rgba('+colors[c]+',.16)');g.addColorStop(1,'rgba('+colors[c]+',0)');ac.fillStyle=g;ac.fillRect(c*32,0,32,32);}
 const base=document.createElement('canvas'),bc=base.getContext('2d',{alpha:false});
 let w=1,h=1,dpr=1,raf=0,last=0,lightX=0,lightY=0,targetX=0,targetY=0,scrollLight=0,targetScroll=0,lastScroll=scrollY;
 let dark=true;
 function paintBase(){dark=document.documentElement.dataset.theme==='dark';bc.fillStyle=dark?'#142219':'#F6F8F5';bc.globalCompositeOperation='source-over';bc.fillRect(0,0,w,h);bc.globalCompositeOperation=dark?'source-over':'multiply';for(let i=liveCount;i<count;i++){const s=size[i]*dpr*2.8;bc.globalAlpha=(dark?1:.5)*(.12+.12*(.5+.5*Math.sin(phase[i])));bc.drawImage(atlas,tint[i]*32,0,32,32,px[i]*w-s*.5,py[i]*h-s*.5,s,s);}bc.globalAlpha=1;}
 function resize(){dpr=Math.min(devicePixelRatio||1,1.25);w=Math.round(innerWidth*dpr);h=Math.round(innerHeight*dpr);canvas.width=base.width=w;canvas.height=base.height=h;paintBase();if(reduce.matches)draw(0);else start();}
 function draw(now){
  const dt=last?Math.min(48,now-last):16.67;last=now;
  const damp=1-Math.exp(-dt/200);lightX+=(targetX-lightX)*damp;lightY+=(targetY-lightY)*damp;scrollLight+=(targetScroll-scrollLight)*damp;targetScroll*=.965;
  ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;ctx.drawImage(base,0,0);ctx.globalCompositeOperation=dark?'source-over':'multiply';
  const time=now*.00017,incidence=lightX*.7+lightY*.4+scrollLight*.65;
  for(let i=0;i<liveCount;i++){
   const wave=Math.sin(px[i]*5.2+py[i]*3.7+time+incidence+phase[i]*.15);
   const glint=Math.sin(phase[i]+time*.8+lightX*px[i]+lightY*py[i]);
   ctx.globalAlpha=.12+Math.pow((wave+1)*.5,3)*(.16+.24*(glint+1)*.5);
   const hue=tint[i];
   const s=size[i]*dpr*3.2;
   const alpha=ctx.globalAlpha,blend=.2+.15*Math.sin(time*.6+phase[i]+incidence);
   ctx.globalAlpha=alpha*(1-blend);ctx.drawImage(atlas,hue*32,0,32,32,px[i]*w-s*.5,py[i]*h-s*.5,s,s);
   ctx.globalAlpha=alpha*blend;ctx.drawImage(atlas,((hue+1)&3)*32,0,32,32,px[i]*w-s*.5,py[i]*h-s*.5,s,s);
  }
  ctx.globalAlpha=1;
 }
 function tick(now){raf=0;if(document.hidden||reduce.matches)return;if(now-last>=66)draw(now);raf=requestAnimationFrame(tick);}
 function start(){if(!raf&&!document.hidden&&!reduce.matches){last=0;raf=requestAnimationFrame(tick);}}
 function stop(){cancelAnimationFrame(raf);raf=0;last=0;}
 addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;targetX=(e.clientX/innerWidth-.5)*2;targetY=(e.clientY/innerHeight-.5)*2;},{passive:true});
 addEventListener('scroll',()=>{const next=scrollY;targetScroll=Math.max(-1,Math.min(1,targetScroll+(next-lastScroll)*.003));lastScroll=next;},{passive:true});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else start();});
 addEventListener('pagehide',stop);addEventListener('pageshow',start);
 reduce.addEventListener('change',()=>{stop();if(reduce.matches)draw(0);else start();});
 new MutationObserver(()=>{paintBase();if(reduce.matches)draw(0);}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
 let resizeTimer;addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(resize,150);},{passive:true});resize();
})();
