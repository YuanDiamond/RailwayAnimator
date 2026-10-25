/* Railcraft: deterministic voxel geometry and standalone, big-endian NBT export. */
(function(root){
'use strict';
const woods=['oak','spruce','birch','jungle','acacia','dark_oak','mangrove','cherry','pale_oak','crimson','warped','bamboo','poplar'];
const defaults={gameVersion:'1.21.4',mode:'bezier',length:96,heading:0,radius:36,start:0,angle:120,points:[[0,0],[25,-35],[65,45],[96,10]],wood:'cherry',log:'dark_oak',height:12,interval:15,rail:'powered_rail',lamps:true,pillars:true};
const key=(x,y,z)=>`${x},${y},${z}`,key2=p=>`${p.x},${p.z}`;
const logName=w=>w==='bamboo'?'bamboo_block':w==='crimson'||w==='warped'?w+'_stem':w+'_log';
function curve(c,t){
 if(c.mode==='line'){let a=c.heading*Math.PI/180;return {x:t*c.length*Math.cos(a),z:t*c.length*Math.sin(a)};}
 if(c.mode==='circle'){let a=(c.start+c.angle*t)*Math.PI/180;return {x:c.radius*Math.cos(a),z:c.radius*Math.sin(a)};}
 let p=c.points,u=1-t;return {x:u*u*u*p[0][0]+3*u*u*t*p[1][0]+3*u*t*t*p[2][0]+t*t*t*p[3][0],z:u*u*u*p[0][1]+3*u*u*t*p[1][1]+3*u*t*t*p[2][1]+t*t*t*p[3][1]};
}
function sample(c){
 let approx=0,last=curve(c,0);for(let i=1;i<=200;i++){let p=curve(c,i/200);approx+=Math.hypot(p.x-last.x,p.z-last.z);last=p;}
 if(approx<8||approx>1800)throw Error('路线长度需在 8–1800 格之间。');
 let n=Math.ceil(approx*5),out=[],dist=0;
 for(let i=0;i<=n;i++){let t=i/n,p=curve(c,t),a=curve(c,Math.max(0,t-.0001)),b=curve(c,Math.min(1,t+.0001)),d=Math.hypot(b.x-a.x,b.z-a.z);if(d<.00001)throw Error('控制点产生了折返或零长度切线，请拉开控制点。');
 if(i)dist+=Math.hypot(p.x-out[i-1].x,p.z-out[i-1].z);out.push({...p,nx:-(b.z-a.z)/d,nz:(b.x-a.x)/d,dist});}
 // Reject tight bends: the seven-block-wide deck needs a non-overlapping offset.
 for(let i=4;i<out.length-4;i+=4){let a=out[i-4],b=out[i+4],turn=Math.acos(Math.max(-1,Math.min(1,a.nx*b.nx+a.nz*b.nz)));if(turn>.001&&(b.dist-a.dist)/turn<9)throw Error('弯道过紧（局部半径小于 9 格），请增大半径或拉开贝塞尔控制点。');}
 return out;
}
function gridPath(samples,offset,closed){
 const pts=[],seen=new Map();
 function add(x,z){let p={x,z},k=key2(p);if(pts.length&&key2(pts.at(-1))===k)return;
 if(seen.has(k)){let index=seen.get(k);for(let q of pts.splice(index+1))seen.delete(key2(q));return;}
 seen.set(k,pts.length);pts.push(p);}
 for(let s of samples){let off=offset/Math.max(Math.abs(s.nx),Math.abs(s.nz)),tx=Math.round(s.x+off*s.nx),tz=Math.round(s.z+off*s.nz);if(!pts.length){add(tx,tz);continue;}
 let p=pts.at(-1),x=p.x,z=p.z;
 // A four-connected digital path. Corner cells always use an ordinary rail.
 while(x!==tx||z!==tz){let dx=tx-x,dz=tz-z;if(dx&&dz){let ex=Math.abs((x+Math.sign(dx)-s.x)*s.nx+(z-s.z)*s.nz-off),ez=Math.abs((x-s.x)*s.nx+(z+Math.sign(dz)-s.z)*s.nz-off);if(ex<ez)x+=Math.sign(dx);else z+=Math.sign(dz);}else if(dx)x+=Math.sign(dx);else z+=Math.sign(dz);
 if(closed&&x===pts[0].x&&z===pts[0].z&&s.dist>samples.at(-1).dist*.95)break;add(x,z);}
 }
 return pts;
}
const dir=(dx,dz)=>dx>0?'east':dx<0?'west':dz>0?'south':'north';
function railShape(a,p,b){let ds=[dir(a.x-p.x,a.z-p.z),dir(b.x-p.x,b.z-p.z)];if(ds.includes('east')&&ds.includes('west'))return 'east_west';if(ds.includes('north')&&ds.includes('south'))return 'north_south';return ['south_east','south_west','north_west','north_east'].find(s=>s.split('_').every(d=>ds.includes(d)))||'east_west';}
function generate(input){
 const c={...defaults,...input};if(!woods.includes(c.wood)||!woods.includes(c.log))throw Error('未知木材。');
 for(let f of ['height','interval'])if(!Number.isInteger(c[f])||c[f]<1||c[f]>128)throw Error('高度与间距必须是 1–128 的整数。');
 if(!['line','circle','bezier'].includes(c.mode))throw Error('未知曲线类型。');
 if(c.mode==='circle'&&(c.radius<12||c.radius>256||Math.abs(c.angle)<5||Math.abs(c.angle)>360))throw Error('圆半径需为 12–256 格，圆弧角度为 5–360°。');
 if(!['powered_rail','activator_rail'].includes(c.rail))throw Error('未知铁轨类型。');
 let samples=sample(c),closed=c.mode==='circle'&&Math.abs(c.angle)===360;
 let rails=[gridPath(samples,-1,closed),gridPath(samples,1,closed)],center=gridPath(samples,0,closed),edges=[gridPath(samples,-3,closed),gridPath(samples,3,closed)];
 // Turn one-cell ABAB staircases into AABB where free space permits. This
 // preserves connectivity while providing straight cells for powered rails.
 const edgeCells=new Set(edges.flat().map(key2)),originalEdges=new Set(edgeCells),originalRails=new Set(rails.flat().map(key2)),centerCells=new Set(center.map(key2));
 function stationEdge(s,side,nx,nz){let off=3/Math.max(Math.abs(s.nx),Math.abs(s.nz)),target={x:s.x+side*off*s.nx,z:s.z+side*off*s.nz},best=null,dist=Infinity;for(let p of edges[side===-1?0:1]){let lever=`${p.x-side*nx},${p.z-side*nz}`,d=Math.hypot(p.x-target.x,p.z-target.z);if(d<dist&&!originalRails.has(lever)&&!centerCells.has(lever)&&!originalEdges.has(lever)){dist=d;best=p;}}if(!best||dist>4)throw Error('设施节点附近没有安全的拉杆位置，请调整路线或设施间距。');return best;}
 let reservedNext=0;for(let s of samples){if(s.dist+.1<reservedNext||(closed&&s.dist>samples.at(-1).dist-8))continue;reservedNext+=c.interval;
 let nx=Math.abs(s.nx)>Math.abs(s.nz)?Math.sign(s.nx):0,nz=nx?0:Math.sign(s.nz);
 for(let side of [-1,1]){let edge=stationEdge(s,side,nx,nz);edgeCells.add(`${edge.x-side*nx},${edge.z-side*nz}`);}}
 for(let lane=0;lane<2;lane++){let path=rails[lane],occupied=new Set(rails.flat().map(key2));
 for(let i=0;i+4<path.length;i++){let p=path.slice(i,i+5),v=p.slice(1).map((q,j)=>({x:q.x-p[j].x,z:q.z-p[j].z}));
 if(v[0].x!==v[2].x||v[0].z!==v[2].z||v[1].x!==v[3].x||v[1].z!==v[3].z||v[0].x*v[1].x+v[0].z*v[1].z!==0)continue;
 let q={x:p[1].x+v[0].x,z:p[1].z+v[0].z},k=key2(q);if(occupied.has(k)||edgeCells.has(k)||centerCells.has(k))continue;occupied.delete(key2(path[i+2]));path[i+2]=q;occupied.add(k);i+=2;
 }}
 const railSet=new Set();for(let path of rails){if(path.length<2)throw Error('路线过短。');for(let p of path){let k=key2(p);if(railSet.has(k))throw Error('两条轨道相交，请调整控制点。');railSet.add(k);}}
 // Distant centerline sections may not intersect or overlap their deck footprints.
 let sparse=samples.filter((s,i)=>i%20===0);for(let i=0;i<sparse.length;i++)for(let j=i+1;j<sparse.length;j++){let d=sparse[j].dist-sparse[i].dist;if(d<12||(closed&&samples.at(-1).dist-d<12))continue;if(Math.hypot(sparse[i].x-sparse[j].x,sparse[i].z-sparse[j].z)<7)throw Error('路线发生自交或桥面重叠，请调整控制点。');}
 const blocks=new Map(),h=c.height;
 function put(x,y,z,name,props={}){x=Math.round(x);y=Math.round(y);z=Math.round(z);blocks.set(key(x,y,z),{x,y,z,name:'minecraft:'+name,props});}
 let footprint=new Map();
 for(let s of samples){for(let dx=-4;dx<=4;dx++)for(let dz=-4;dz<=4;dz++){let x=Math.round(s.x)+dx,z=Math.round(s.z)+dz,dist=Math.hypot(x-s.x,z-s.z),k=`${x},${z}`;let old=footprint.get(k);if(!old||dist<old.dist)footprint.set(k,{x,z,dist,offset:(x-s.x)*s.nx+(z-s.z)*s.nz,s});}}
 for(let p of footprint.values()){let norm=Math.max(Math.abs(p.s.nx),Math.abs(p.s.nz));if(p.dist>3.6/norm)continue;let lane=Math.round(Math.abs(p.offset)*norm),name=lane===0?logName(c.log):lane===1?'smooth_stone':lane===2?c.wood+'_planks':c.wood+'_slab';let props=lane===0?{axis:'y'}:lane>=3?{type:'top',waterlogged:'false'}:{};put(p.x,h,p.z,name,props);}
 for(let p of center){if(!railSet.has(key2(p))){put(p.x,h,p.z,logName(c.log),{axis:'y'});put(p.x,h+1,p.z,'iron_bars',{waterlogged:'false'});}}
 for(let path of edges)for(let p of path){if(railSet.has(key2(p)))throw Error('护栏与轨道重叠，请放缓曲线。');put(p.x,h,p.z,c.wood+'_slab',{type:'top',waterlogged:'false'});put(p.x,h+1,p.z,c.wood+'_fence',{waterlogged:'false'});}
 let powered=0,curved=0;
 for(let path of rails)for(let i=0;i<path.length;i++){let p=path[i],a=i?path[i-1]:closed?path.at(-1):{x:2*p.x-path[1].x,z:2*p.z-path[1].z},b=i<path.length-1?path[i+1]:closed?path[0]:{x:2*p.x-a.x,z:2*p.z-a.z};
 if(Math.abs(p.x-a.x)+Math.abs(p.z-a.z)!==1||Math.abs(p.x-b.x)+Math.abs(p.z-b.z)!==1)throw Error('轨道闭合失败，请调整角度或半径。');
 let shape=railShape(a,p,b),straight=['east_west','north_south'].includes(shape);put(p.x,h,p.z,'smooth_stone');put(p.x,h+1,p.z,straight?c.rail:'rail',straight?{shape,powered:'true',waterlogged:'false'}:{shape,waterlogged:'false'});straight?powered++:curved++;}
 const stations=[];let next=0;
 for(let i=0;i<samples.length;i++){let s=samples[i];if(s.dist+.1<next||(closed&&s.dist>samples.at(-1).dist-8))continue;next+=c.interval;
 let nx=Math.abs(s.nx)>Math.abs(s.nz)?Math.sign(s.nx):0,nz=nx?0:Math.sign(s.nz),cx=Math.round(s.x),cz=Math.round(s.z);
 const at=(side,d,y,name,props)=>put(cx+nx*side*d,y,cz+nz*side*d,name,props);
 for(let side of [-1,1]){
 // Find the actual digital outer fence, then place the lever one cell inward.
 let edge=stationEdge(s,side,nx,nz);
 let lx=edge.x-side*nx,lz=edge.z-side*nz;if(!railSet.has(`${lx},${lz}`)&&blocks.get(key(lx,h+1,lz))?.name!=='minecraft:iron_bars'){put(lx,h,lz,c.wood+'_planks');put(lx,h+1,lz,'lever',{face:'floor',facing:dir(nx,nz),powered:'true'});}
 if(c.lamps){for(let y=h+2;y<=h+3;y++)put(edge.x,y,edge.z,c.wood+'_fence',{waterlogged:'false'});
 for(let d=0;d<=1;d++)put(edge.x-side*nx*d,h+4,edge.z-side*nz*d,'spruce_trapdoor',{facing:dir(-side*nx,-side*nz),half:'top',open:'false',powered:'false',waterlogged:'false'});
 put(edge.x-side*nx,h+3,edge.z-side*nz,'lantern',{hanging:'true',waterlogged:'false'});}
 }
 if(c.pillars){for(let y=0;y<h;y++)put(cx,y,cz,logName(c.log),{axis:'y'});
 for(let side of [-1,1]){at(side,1,h-1,'stone_bricks');at(side,2,h-1,'stone_brick_stairs',{facing:dir(-side*nx,-side*nz),half:'top',shape:'straight',waterlogged:'false'});if(h>=3)at(side,1,h-2,'lantern',{hanging:'true',waterlogged:'false'});
 put(cx-side*nz,h-1,cz+side*nx,'stone_brick_stairs',{facing:dir(side*nz,-side*nx),half:'top',shape:'straight',waterlogged:'false'});}
 }stations.push({x:cx,z:cz});}
 // Serialize explicit fence/bar connections, including stair-stepped bends.
 for(let b of blocks.values())if(b.name.endsWith('_fence')||b.name.endsWith(':iron_bars'))for(let [d,dx,dz] of [['east',1,0],['west',-1,0],['south',0,1],['north',0,-1]])b.props[d]=String(blocks.get(key(b.x+dx,b.y,b.z+dz))?.name===b.name);
 let arr=[...blocks.values()],bounds=getBounds(arr);if(arr.length>180000)throw Error('方块数超过 180,000，请缩短路线或降低桥墩。');
 return {config:c,blocks:arr,bounds,rails,stations,samples,length:samples.at(-1).dist,powered,curved,closed};
}
function getBounds(a){if(!a.length)throw Error('选区中没有方块。');let b={minX:Infinity,minY:Infinity,minZ:Infinity,maxX:-Infinity,maxY:-Infinity,maxZ:-Infinity};for(let p of a){b.minX=Math.min(b.minX,p.x);b.maxX=Math.max(b.maxX,p.x);b.minY=Math.min(b.minY,p.y);b.maxY=Math.max(b.maxY,p.y);b.minZ=Math.min(b.minZ,p.z);b.maxZ=Math.max(b.maxZ,p.z);}return b;}
function crop(blocks,b){return blocks.filter(p=>p.x>=b.minX&&p.x<=b.maxX&&p.y>=b.minY&&p.y<=b.maxY&&p.z>=b.minZ&&p.z<=b.maxZ);}
const T={byte:v=>({t:1,v}),int:v=>({t:3,v}),long:v=>({t:4,v:BigInt(v)}),str:v=>({t:8,v}),list:(type,v)=>({t:9,sub:type,v}),compound:v=>({t:10,v}),longs:v=>({t:12,v})};
class Writer{
 constructor(){this.bytes=[];this.enc=new TextEncoder();}
 u8(x){this.bytes.push(x&255);}num(x,n){let b=BigInt(x);for(let i=n-1;i>=0;i--)this.u8(Number((b>>BigInt(i*8))&255n));}
 str(s){let b=this.enc.encode(s);this.num(b.length,2);for(let x of b)this.u8(x);}
 payload(t,v,sub){if(t===1)this.u8(v);else if(t===3)this.num(v,4);else if(t===4)this.num(v,8);else if(t===8)this.str(v);else if(t===9){this.u8(sub);this.num(v.length,4);for(let a of v)this.payload(sub,a.v,a.sub);}else if(t===10){for(let [name,a]of Object.entries(v)){this.u8(a.t);this.str(name);this.payload(a.t,a.v,a.sub);}this.u8(0);}else if(t===12){this.num(v.length,4);for(let x of v)this.num(x,8);}else throw Error('Unsupported NBT tag '+t);}
 write(tag){this.u8(10);this.str('');this.payload(10,tag.v);return new Uint8Array(this.bytes);}
}
function prepare(blocks,bounds){let b=bounds||getBounds(blocks),size=[b.maxX-b.minX+1,b.maxY-b.minY+1,b.maxZ-b.minZ+1],palette=[{name:'minecraft:air',props:{}}],map=new Map([['minecraft:air{}',0]]);if(size.some(n=>n<=0)||size.reduce((a,b)=>a*b,1)>32000000)throw Error('导出包围盒过大，请缩小选区（最多 3200 万体素）。');
 let indexed=blocks.map(p=>{let props=Object.fromEntries(Object.entries(p.props).sort()),k=p.name+JSON.stringify(props);if(!map.has(k)){map.set(k,palette.length);palette.push({name:p.name,props});}return {x:p.x-b.minX,y:p.y-b.minY,z:p.z-b.minZ,state:map.get(k)};});return {bounds:b,size,palette,indexed};}
const vec=(x,y,z)=>T.compound({x:T.int(x),y:T.int(y),z:T.int(z)});
const paletteNBT=p=>p.map(b=>T.compound({Name:T.str(b.name),...(Object.keys(b.props).length?{Properties:T.compound(Object.fromEntries(Object.entries(b.props).map(([k,v])=>[k,T.str(v)])))}:{})}));
function dataVersionForBlocks(blocks){return blocks.some(b=>b.name.startsWith('minecraft:poplar_'))?5023:4189;}
function nbt(blocks,format,name='Railcraft bridge',bounds,dataVersion){dataVersion=dataVersion??dataVersionForBlocks(blocks);if(![4189,5023].includes(dataVersion)||dataVersion<dataVersionForBlocks(blocks))throw Error('杨木需要 Minecraft 26.3 导出版本。');let {size,palette,indexed}=prepare(blocks,bounds),[sx,sy,sz]=size,tag;
 if(format==='nbt'){tag=T.compound({DataVersion:T.int(dataVersion),author:T.str('DiamondYuan(菱源)'),size:T.list(3,size.map(T.int)),palette:T.list(10,paletteNBT(palette)),blocks:T.list(10,indexed.map(b=>T.compound({pos:T.list(3,[b.x,b.y,b.z].map(T.int)),state:T.int(b.state)}))),entities:T.list(10,[])});}
 else {let bits=Math.max(2,Math.ceil(Math.log2(palette.length))),volume=sx*sy*sz,longs=Array(Math.ceil(volume*bits/64)).fill(0n);
 for(let b of indexed){let index=(b.y*sz+b.z)*sx+b.x,bit=index*bits,li=Math.floor(bit/64),shift=bit%64,value=BigInt(b.state);longs[li]|=BigInt.asUintN(64,value<<BigInt(shift));if(shift+bits>64)longs[li+1]|=value>>BigInt(64-shift);}
 let now=BigInt(Date.now());tag=T.compound({Version:T.int(dataVersion>=5023?7:6),SubVersion:T.int(1),MinecraftDataVersion:T.int(dataVersion),Metadata:T.compound({Name:T.str(name),Author:T.str('DiamondYuan(菱源)'),Description:T.str('Generated locally by Railcraft Bridge Studio'),RegionCount:T.int(1),TimeCreated:T.long(now),TimeModified:T.long(now),TotalBlocks:T.int(indexed.length),TotalVolume:T.int(volume),EnclosingSize:vec(sx,sy,sz)}),Regions:T.compound({Bridge:T.compound({Position:vec(0,0,0),Size:vec(sx,sy,sz),BlockStatePalette:T.list(10,paletteNBT(palette)),BlockStates:T.longs(longs),Entities:T.list(10,[]),TileEntities:T.list(10,[]),PendingBlockTicks:T.list(10,[]),PendingFluidTicks:T.list(10,[])})})});}
 return new Writer().write(tag);
}
// Standards-compliant gzip stored blocks: works offline and on file:// without dependencies.
function gzipStore(data){let crc=0xffffffff;for(let b of data){crc^=b;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}crc=(crc^0xffffffff)>>>0;let count=Math.ceil(data.length/65535)||1,out=new Uint8Array(10+data.length+count*5+8);out.set([31,139,8,0,0,0,0,0,0,255]);let p=10;for(let i=0;i<count;i++){let n=Math.min(65535,data.length-i*65535);out[p++]=i===count-1?1:0;out[p++]=n&255;out[p++]=n>>8;out[p++]=(~n)&255;out[p++]=((~n)>>8)&255;out.set(data.subarray(i*65535,i*65535+n),p);p+=n;}let view=new DataView(out.buffer);view.setUint32(p,crc,true);view.setUint32(p+4,data.length,true);return out;}
async function exportFile(blocks,format,name,bounds,dataVersion){let raw=nbt(blocks,format,name,bounds,dataVersion);if(typeof CompressionStream!=='undefined'){let stream=new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'));return new Uint8Array(await new Response(stream).arrayBuffer());}return gzipStore(raw);}
const api={defaults,woods,generate,getBounds,crop,prepare,nbt,gzipStore,exportFile,curve,railShape,dataVersionForBlocks};if(typeof module!=='undefined')module.exports=api;root.Railcraft=api;
})(typeof window!=='undefined'?window:globalThis);
