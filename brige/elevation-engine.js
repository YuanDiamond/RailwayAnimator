(function(root){'use strict';
const E=typeof module!=='undefined'?require('./route-engine.js'):root.Railcraft,buildFlat=E.generate;
const key=p=>p.x+','+p.z,k3=(x,y,z)=>x+','+y+','+z,dirs=[['east',1,0],['west',-1,0],['south',0,1],['north',0,-1]],face=(x,z)=>x>0?'east':x<0?'west':z>0?'south':'north';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
function segmentLevels(config){let current=config.height??E.defaults.height,cursor=0;return config.segments.map((segment,index)=>{let points=E.segmentPoints(segment),length=points.slice(1).reduce((n,p,i)=>n+distance(p,points[i]),0),end=segment.endHeight??current;if(!Number.isInteger(end)||end<3||end>256)throw Error('第 '+(index+1)+' 段终点高度需为 3–256 的整数。');if(segment.type!=='line'&&end!==current)throw Error('仅直线允许高度变化；第 '+(index+1)+' 段为曲线。');let result={index,type:segment.type,start:cursor,end:cursor+length,startHeight:current,endHeight:end};current=end;cursor+=length;return result;});}
function generate(input={}){
 // Build a shared two-dimensional footprint, then lift the actual block columns.
 const base=buildFlat({...input,lamps:false,pillars:false}),c={...base.config,lamps:input.lamps??E.defaults.lamps,pillars:input.pillars??E.defaults.pillars},h=c.height,levels=segmentLevels(c),buckets=new Map(),sampleCache=new Map();
 for(let s of base.samples){let k=Math.floor(s.x/8)+','+Math.floor(s.z/8);if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(s);}
 function closest(x,z){let k=x+','+z;if(sampleCache.has(k))return sampleCache.get(k);let bx=Math.floor(x/8),bz=Math.floor(z/8),best=null,bestD=Infinity;for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(let s of buckets.get((bx+dx)+','+(bz+dz))||[]){let d=(s.x-x)**2+(s.z-z)**2;if(d<bestD){best=s;bestD=d;}}if(!best)for(let s of base.samples){let d=(s.x-x)**2+(s.z-z)**2;if(d<bestD){best=s;bestD=d;}}sampleCache.set(k,best);return best;}
 const flatMap=new Map(base.blocks.map(b=>[k3(b.x,b.y,b.z),b])),changes=[];
 for(let level of levels){let delta=level.endHeight-level.startHeight;if(!delta)continue;const available=[];for(let i=1;i<base.center.length-2;i++){let p=base.center[i],q=base.center[i+1],a=closest(p.x,p.z).dist,b=closest(q.x,q.z).dist,d=(a+b)/2;if(d<=level.start+.25||d>=level.end-.25||b<=a)continue;let dx=q.x-p.x,dz=q.z-p.z,nx=-dz,nz=dx,shape=dx?'east_west':'north_south',safe=true;for(let side of [-1,1])for(let v of [p,q]){let rail=flatMap.get(k3(v.x+side*nx,h+1,v.z+side*nz));if(!rail||rail.props.shape!==shape)safe=false;}if(safe)available.push({d,index:i});}
 if(available.length<Math.abs(delta))throw Error('第 '+(level.index+1)+' 段直线只有 '+available.length+' 个可用升降位置，高差为 '+Math.abs(delta)+'。请延长直线、减小高差，或沿 X/Z 轴绘制。');
 for(let j=0;j<Math.abs(delta);j++){let slot=available[Math.round((j+.5)*available.length/Math.abs(delta)-.5)];changes.push({...slot,segment:level.index,delta:Math.sign(delta),afterHeight:level.startHeight+(j+1)*Math.sign(delta)});}}
 if(base.closed&&levels.at(-1).endHeight!==h)throw Error('闭合路线的终点高度必须等于起点高度。');changes.sort((a,b)=>a.d-b.d);
 const heights=new Map();function heightAt(x,z){let k=x+','+z;if(heights.has(k))return heights.get(k);let d=closest(x,z).dist,lo=0,hi=changes.length;while(lo<hi){let mid=(lo+hi)>>1;if(changes[mid].d<=d)lo=mid+1;else hi=mid;}let value=lo?changes[lo-1].afterHeight:h;heights.set(k,value);return value;}
 let map=new Map(),deck=new Map(),transitionColumns=new Set();const put=(x,y,z,name,props={})=>{let b={x,y,z,name:name.startsWith('minecraft:')?name:'minecraft:'+name,props:{...props}};map.set(k3(x,y,z),b);return b;};
 for(let b of base.blocks){let H=heightAt(b.x,b.z),lifted=put(b.x,b.y+H-h,b.z,b.name,b.props);if(b.y===h)deck.set(key(b),lifted);}
 // Horizontal grain follows each outgoing grid step; vertical bridge piers are
 // generated independently below the deck.
 for(let i=0;i<base.center.length;i++){let p=base.center[i],q=base.center[i+1]||base.center[i-1],b=deck.get(key(p));b.props.axis=q.x!==p.x?'x':'z';}
 // Only columns immediately on the high side of a real one-block rise acquire
 // a second structural layer. A flat landing keeps its original one-layer row.
 for(let b of deck.values()){for(let[,dx,dz]of dirs){let neighbor=deck.get((b.x+dx)+','+(b.z+dz));if(neighbor&&b.y-neighbor.y===1)transitionColumns.add(key(b));}}
 for(let k of transitionColumns){let b=deck.get(k);if(b.name.endsWith('_slab')){put(b.x,b.y,b.z,c.wood+'_planks');deck.set(k,map.get(k3(b.x,b.y,b.z)));}else put(b.x,b.y-1,b.z,b.name,b.props);}
 const railHeights=[];let ascending=0;
 for(let path of base.rails){let elevated=[];for(let i=0;i<path.length;i++){let p=path[i],H=heightAt(p.x,p.z),rail=map.get(k3(p.x,H+1,p.z)),neighbors=[];if(i||base.closed)neighbors.push(path[(i-1+path.length)%path.length]);if(i<path.length-1||base.closed)neighbors.push(path[(i+1)%path.length]);let higher=neighbors.filter(q=>heightAt(q.x,q.z)>H);if(neighbors.some(q=>Math.abs(heightAt(q.x,q.z)-H)>1)||higher.length>1)throw Error('坡轨高度不连续，请减小高差或增加水平直段。');if(higher.length){if(!['east_west','north_south'].includes(rail.props.shape))throw Error('升降落在栅格弯角处，请调整直线方向或减小高差。');let q=higher[0];rail.props.shape='ascending_'+face(q.x-p.x,q.z-p.z);ascending++;}elevated.push({x:p.x,z:p.z,y:H+1});}railHeights.push(elevated);}
 function extendGuard(path,name){for(let i=0;i<path.length;i++){let p=path[i],low=heightAt(p.x,p.z)+1,top=low;for(let j of [i-1,i+1]){if(!base.closed&&(j<0||j>=path.length))continue;let q=path[(j+path.length)%path.length],other=heightAt(q.x,q.z)+1;if(Math.abs(other-low)>1)throw Error('护栏高度跳变超过一格，请放缓升降。');top=Math.max(top,other);}for(let y=low;y<=top;y++)put(p.x,y,p.z,name,{waterlogged:'false'});}}
 extendGuard(base.center,'iron_bars');for(let edge of base.edges)extendGuard(edge,c.wood+'_fence');
 const log=c.log==='bamboo'?'bamboo_block':['crimson','warped'].includes(c.log)?c.log+'_stem':c.log+'_log';
 for(let facility of base.facilities){let p=facility.center,H=heightAt(p.x,p.z),bottom=H-(transitionColumns.has(key(p))?1:0);
 if(c.pillars){for(let y=0;y<bottom;y++)put(p.x,y,p.z,log,{axis:'y'});let s=facility.sides[0],nx=s.nx,nz=s.nz;for(let side of [-1,1]){put(p.x+nx*side,bottom-1,p.z+nz*side,'stone_bricks');put(p.x+nx*side*2,bottom-1,p.z+nz*side*2,'stone_brick_stairs',{facing:face(-side*nx,-side*nz),half:'top',shape:'straight',waterlogged:'false'});put(p.x+nx*side,bottom-2,p.z+nz*side,'lantern',{hanging:'true',waterlogged:'false'});put(p.x-nz*side,bottom-1,p.z+nx*side,'stone_brick_stairs',{facing:face(nz*side,-nx*side),half:'top',shape:'straight',waterlogged:'false'});}}
 if(c.lamps)for(let s of facility.sides){let{edge,lx,lz,nx,nz,side}=s,baseH=Math.max(H,heightAt(edge.x,edge.z),heightAt(lx,lz));for(let y=heightAt(edge.x,edge.z)+1;y<=baseH+3;y++)put(edge.x,y,edge.z,c.wood+'_fence',{waterlogged:'false'});for(let d=0;d<2;d++)put(edge.x-side*nx*d,baseH+4,edge.z-side*nz*d,'spruce_trapdoor',{facing:face(-side*nx,-side*nz),half:'bottom',open:'false',powered:'false',waterlogged:'false'});put(lx,baseH+3,lz,'lantern',{hanging:'true',waterlogged:'false'});}}
 // A material decision uses the actual horizontal log faces at that height,
 // rather than whether the rail is curved. Piers never count as center logs.
 const deckLogs=new Set();for(let p of base.center){let H=heightAt(p.x,p.z);deckLogs.add(k3(p.x,H,p.z));if(transitionColumns.has(key(p)))deckLogs.add(k3(p.x,H-1,p.z));}
 function touchesLog(x,y,z){return dirs.some(([,dx,dz])=>deckLogs.has(k3(x+dx,y,z+dz)));}
 for(let path of base.rails)for(let p of path){let H=heightAt(p.x,p.z);for(let y of transitionColumns.has(key(p))?[H,H-1]:[H])put(p.x,y,p.z,touchesLog(p.x,y,p.z)?'smooth_stone':c.wood+'_planks');}
 for(let b of map.values())if(b.name.endsWith('_fence')||b.name==='minecraft:iron_bars')for(let[d,dx,dz]of dirs)b.props[d]=String(map.get(k3(b.x+dx,b.y,b.z+dz))?.name===b.name);
 let blocks=[...map.values()];if(blocks.length>180000)throw Error('超过 180,000 方块，请缩短路线或降低桥墩。');return{...base,config:c,blocks,bounds:E.getBounds(blocks),heightProfile:levels,elevationChanges:changes,transitionColumns:[...transitionColumns].map(k=>{let b=deck.get(k);return{x:b.x,z:b.z,y:b.y};}),railHeights,ascending,heightAt};
}
Object.assign(E,{generate,segmentLevels});if(typeof module!=='undefined')module.exports=E;root.Railcraft=E;
})(typeof window!=='undefined'?window:globalThis);
