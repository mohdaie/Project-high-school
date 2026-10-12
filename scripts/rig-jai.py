"""Rig Jai, an image-to-3D schoolboy in a T-pose, as the game's street fighter in Blender.
Run: blender -b --python scripts/rig-jai.py -- assets/models/jai-source.glb assets/models/jai-fighter.glb assets/models/jai-fighter.blend
The body keeps its shape, UVs and texture; weights come from Blender's bone heat on the welded mesh.
The fused mitten hands are replaced by modelled five-finger hands (three joints per finger, a white
wrap like a street fighter's) and two leaf bones, ribs and belly, let the chest breathe.
"""
import bpy, json, struct, sys, math
import numpy as np
from pathlib import Path
from mathutils import Vector, Quaternion

args=sys.argv[sys.argv.index('--')+1:]
source, output, blend=[Path(p).resolve() for p in args[:3]]
b=source.read_bytes(); size=struct.unpack_from('<I',b,12)[0]
g=json.loads(b[20:20+size]); binary=b[28+size:]
def read(i):
 a=g['accessors'][i]; view=g['bufferViews'][a['bufferView']]; width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
 dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]
 return np.frombuffer(binary,dtype=dtype,count=a['count']*width,offset=view.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],width).copy()
p=g['meshes'][0]['primitives'][0]
P=read(p['attributes']['POSITION']).astype(float); UV=read(p['attributes']['TEXCOORD_0']).astype(float); I=read(p['indices']).reshape(-1,3)
# Game space: metres, feet on the floor, facing +z, his left at +x.
HEIGHT=1.75; s=HEIGHT/(P[:,1].max()-P[:,1].min()); floor=P[:,1].min()
def game(q): return np.array([q[0]*s,(q[1]-floor)*s,q[2]*s])
P=np.column_stack((P[:,0]*s,(P[:,1]-floor)*s,P[:,2]*s))
def unit(v): return v/np.linalg.norm(v)
def smooth(x): x=np.clip(x,0,1); return x*x*(3-2*x)

# Joint centres in source units, read from cross-sections of the mesh (left side; right is mirrored).
SRC={'hips':(0,-.035,-.005),'spine001':(0,.04,-.02),'spine002':(0,.13,-.02),'spine003':(0,.21,-.02),'neck':(0,.325,-.012),'head':(0,.358,0),'headTop':(0,.491,0),
 'shoulderL':(.022,.30,-.012),'upper_armL':(.108,.287,-.018),'forearmL':(.25,.29,-.021),'handL':(.385,.295,-.007),'handTipL':(.50,.29,.005),
 'thighL':(.055,-.045,-.003),'shinL':(.074,-.24,-.024),'footL':(.092,-.438,-.04),'toeL':(.118,-.478,.045),'toeTipL':(.13,-.49,.092)}
J={n:game(v) for n,v in SRC.items()}
for n in [n for n in J if n.endswith('L')]: J[n[:-1]+'R']=J[n]*[-1,1,1]
CUFF=.381*s # the sleeve ends here; the skin beyond it is the mitten hand
# Breathing: leaf bones near the back so the front of the ribcage and belly moves most.
J['ribs']=np.array([0,J['spine003'][1]-.07,-.10]); J['ribsTip']=J['ribs']+[0,.12,0]
J['belly']=np.array([0,J['spine001'][1],-.08]); J['bellyTip']=J['belly']+[0,.08,0]

# ---- the hand: palm and wrist wrap, four fingers and a thumb, in a frame on the wrist.
# a runs wrist to fingertips, b toward the thumb, c out of the palm (down in the T-pose).
FINGERS=[('index',.004,.028,.05,(.040,.024,.019),.0092),('middle',0,.0095,0,(.044,.028,.020),.0096),('ring',.004,-.0095,-.04,(.041,.026,.019),.0090),('pinky',.013,-.027,-.10,(.032,.019,.017),.0080)]
THUMB=((.010,.020,.010),(.78,.55,.30),(.042,.032,.028),(.0135,.011,.0095,.008))
KNUCKLE=.093
def frame(side):
 W=J['hand'+side]; f=unit(J['handTip'+side]-W); n=np.array([0.,-1,0]); n=unit(n-f*(n@f)); t=np.cross(n,f)
 if side=='R': t=-t
 return W,f,t,n
def local(side,a,b,c):
 W,f,t,n=frame(side); return W+f*a+t*b+n*c
def ldir(side,a,b,c):
 W,f,t,n=frame(side); return unit(f*a+t*b+n*c)
for side in ['L','R']:
 for name,back,across,splay,lengths,r in FINGERS:
  base=local(side,KNUCKLE-back,across,0); d=ldir(side,math.cos(splay),math.sin(splay),0); at=0
  for k,l in enumerate(lengths): J[f'f_{name}0{k+1}{side}']=base+d*at; at+=l
  J[f'f_{name}Tip{side}']=base+d*at
 (a,b_,c),dv,lengths,_=THUMB; base=local(side,a,b_,c); d=ldir(side,*dv); at=0
 for k,l in enumerate(lengths): J[f'thumb0{k+1}{side}']=base+d*at; at+=l
 J['thumbTip'+side]=base+d*at

BASE=['hips','spine001','spine002','spine003','neck','head']+[n+s_ for s_ in 'LR' for n in ['shoulder','upper_arm','forearm','hand','thigh','shin','foot','toe']]
DIGITS=[f'f_{n}0{k}' for n,*_ in FINGERS for k in (1,2,3)]+[f'thumb0{k}' for k in (1,2,3)]
names=BASE+[d+s_ for s_ in 'LR' for d in DIGITS]+['ribs','belly']
parent={'spine001':'hips','spine002':'spine001','spine003':'spine002','neck':'spine003','head':'neck','ribs':'spine003','belly':'spine001'}
tail={'hips':'spine001','spine001':'spine002','spine002':'spine003','spine003':'neck','neck':'head','head':'headTop','ribs':'ribsTip','belly':'bellyTip'}
for s_ in 'LR':
 for name,par,end in [('shoulder','spine003','upper_arm'),('upper_arm','shoulder','forearm'),('forearm','upper_arm','hand'),('hand','forearm','f_middle01'),('thigh','hips','shin'),('shin','thigh','foot'),('foot','shin','toe'),('toe','foot','toeTip')]:
  parent[name+s_]=par if par in ('spine003','hips') else par+s_; tail[name+s_]=end+s_
 for d in [n for n,*_ in FINGERS]+['thumb']:
  pre='f_'+d if d!='thumb' else d
  for k in (1,2,3): parent[f'{pre}0{k}{s_}']='hand'+s_ if k==1 else f'{pre}0{k-1}{s_}'; tail[f'{pre}0{k}{s_}']=(f'{pre}0{k+1}' if k<3 else pre+'Tip')+s_

# ---- weld the body (UV seams split it into 92 islands) and drop the mitten hands.
keys=np.round(P*1e5).astype(np.int64); _,first,weld=np.unique(keys,axis=0,return_index=True,return_inverse=True); weld=weld.ravel()
V=P[first]; F=weld[I]; corner_uv=UV[I]
hand_v=np.abs(V[:,0])>CUFF; keep_f=~np.any(hand_v[F],axis=1)
used=np.unique(F[keep_f]); remap=np.full(len(V),-1); remap[used]=np.arange(len(used))
V=V[used]; F=remap[F[keep_f]]; corner_uv=corner_uv[keep_f]

bpy.ops.wm.read_factory_settings(use_empty=True)
def world(q): return (float(q[0]),float(-q[2]),float(q[1]))
def from_world(v): return np.array([v[0],v[2],-v[1]])
body=bpy.data.meshes.new('Jai body'); body.from_pydata([world(v) for v in V],[],F.tolist()); body.update()
obj=bpy.data.objects.new('Jai fighter',body); bpy.context.collection.objects.link(obj)
arm=bpy.data.armatures.new('Jai rig'); rig=bpy.data.objects.new('Jai rig',arm); bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active=rig; rig.select_set(True); bpy.ops.object.mode_set(mode='EDIT')
for name in names:
 bone=arm.edit_bones.new('DEF-'+name); bone.head=world(J[name]); bone.tail=world(J[tail[name]])
 if name in parent: bone.parent=arm.edit_bones['DEF-'+parent[name]]
 # Fingers roll so their local x is the curl axis: a fist is a turn about x.
 if name[:-1] in DIGITS: bone.align_roll(Vector(world(-frame(name[-1])[3])))
bpy.ops.object.mode_set(mode='OBJECT')
for bone in arm.bones: bone.use_deform=bone.name[4:] in BASE
# Bone heat over the closed body, as Blender's Ctrl+P "With Automatic Weights".
bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True); rig.select_set(True); bpy.context.view_layer.objects.active=rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
for bone in arm.bones: bone.use_deform=True
W=np.zeros((len(V),len(names)),dtype=np.float64)
group=[names.index(vg.name[4:]) for vg in obj.vertex_groups]
for v in body.vertices:
 for ge in v.groups: W[v.index,group[ge.group]]=ge.weight
missing=W.sum(axis=1)<1e-6
if missing.any(): # a vertex heat missed takes its nearest weighted neighbour's weights
 have=np.flatnonzero(~missing)
 for i in np.flatnonzero(missing): W[i]=W[have[np.argmin(np.linalg.norm(V[have]-V[i],axis=1))]]
W/=W.sum(axis=1,keepdims=True)
idx=names.index
# Sleeve cuffs turn with the forearm; the wrapped wrist blends into the hand.
for s_ in 'LR': W[:,idx('forearm'+s_)]+=W[:,idx('hand'+s_)]; W[:,idx('hand'+s_)]=0
# Elbows and knees bend in a short region round the joint, not like a hose.
for s_ in 'LR':
 for chain,width,share in [(['upper_arm','forearm','hand'],.03,.6),(['thigh','shin','foot'],.045,.6)]:
  a,c,d=[n+s_ for n in chain]; total=W[:,idx(a)]+W[:,idx(c)]; mask=total>share
  axis=unit(unit(J[c]-J[a])+unit(J[d]-J[c])); t=smooth(((V-J[c])@axis+width)/(2*width))
  W[mask,idx(a)]=(1-t[mask])*total[mask]; W[mask,idx(c)]=t[mask]*total[mask]
 # Shoes are stiff: the foot carries the shoe, the toe bone only its front,
 # blended over the ankle so a pointed foot does not tear the trouser hem.
 chain=W[:,[idx(n+s_) for n in ['shin','foot','toe']]].sum(axis=1)>.5
 t=smooth((V[:,2]-(J['toe'+s_][2]-.03))/.04); rigid=np.zeros_like(W); rigid[:,idx('foot'+s_)]=1-t; rigid[:,idx('toe'+s_)]=t
 k=(smooth((J['foot'+s_][1]+.04-V[:,1])/.08)*chain)[:,None]; W=W*(1-k)+rigid*k
# The chin and jaw belong to the head; the neck twists below them, not through the face.
k=np.maximum(smooth((V[:,1]-J['head'][1]+.04)/.04)*smooth((V[:,2]-.01)/.03),smooth((V[:,1]-J['head'][1])/.035))[:,None]
W=W*(1-k)+np.eye(len(names))[idx('head')]*k
# A raised knee pulls the trousers, not the shirt: thighs fade out above the hip joint.
for s_ in 'LR':
 k=smooth((V[:,1]-J['thigh'+s_][1]-.03)/.1); W[:,idx('hips')]+=W[:,idx('thigh'+s_)]*k; W[:,idx('thigh'+s_)]*=1-k
# Breathing: the ribcage takes a share of the chest's weight, the belly of the lower back's.
torso=smooth((.15-np.abs(V[:,0]))/.06)
r=smooth(1-np.abs(V[:,1]-(J['spine003'][1]-.04))/.16)*smooth((V[:,2]+.04)/.12)*torso
take=np.minimum(r*.85,W[:,idx('spine002')]+W[:,idx('spine003')]); share=W[:,idx('spine002')]/np.maximum(W[:,idx('spine002')]+W[:,idx('spine003')],1e-9)
W[:,idx('spine002')]-=take*share; W[:,idx('spine003')]-=take*(1-share); W[:,idx('ribs')]+=take
r=smooth(1-np.abs(V[:,1]-J['spine001'][1])/.12)*smooth((V[:,2]+.02)/.10)*torso
take=np.minimum(r*.8,W[:,idx('spine001')]); W[:,idx('spine001')]-=take; W[:,idx('belly')]+=take
W=np.clip(W,0,None); W/=W.sum(axis=1,keepdims=True)

# ---- texture: the source atlas plus a 32px strip of hand colours.
iv=g['bufferViews'][g['images'][0]['bufferView']]; src_png=Path(str(output)+'.source.png'); src_png.write_bytes(binary[iv.get('byteOffset',0):iv.get('byteOffset',0)+iv['byteLength']])
image=bpy.data.images.load(str(src_png)); w0,h0=image.size; pixels=np.array(image.pixels[:],dtype=np.float32).reshape(h0,w0,4)
sample=lambda uv: pixels[np.clip(((1-uv[:,1])*(h0-1)).astype(int),0,h0-1),np.clip((uv[:,0]*(w0-1)).astype(int),0,w0-1),:3]
src_uv=UV; colours=sample(src_uv); mitt=(np.abs(P[:,0])>CUFF+.01)
skin_c=np.median(colours[mitt&(colours[:,0]>colours[:,2]+.12)],axis=0)
image.scale(992,1024); body_px=np.array(image.pixels[:],dtype=np.float32).reshape(1024,992,4)
atlas=np.ones((1024,1024,4),dtype=np.float32); atlas[:,:992]=body_px
PALETTE=[tuple(skin_c),tuple(skin_c*.78),(.93,.91,.86),(.80,.78,.74)] # skin, crease, wrap, wrap fold
rows=1024//len(PALETTE)
for i,col in enumerate(PALETTE): atlas[1024-(i+1)*rows:1024-i*rows,992:,:3]=col
paint=bpy.data.images.new('Jai fighter atlas',width=1024,height=1024,alpha=False); paint.pixels=atlas.ravel().tolist()
paint.filepath_raw=str(Path(str(output)+'.jpg')); paint.file_format='JPEG'; bpy.context.scene.render.image_settings.quality=88; paint.save(); paint.pack()
def pal(i): return (1008/1024,(i*rows+rows/2)/1024) # glTF v runs down from the top
corner_uv=corner_uv*[992/1024,1]

# ---- build the hands as lofted rings, each ring with its own weights.
HV=[];HUV=[];HW=[];HF=[]
def loft(rings,k,start=None,end=None):
 """rings: (centre, d, v_hint, ru, rv, power, palette, {bone: w}). start/end: pole offsets for rounded caps."""
 base=len(HV); ring_ids=[]
 for centre,d,vh,ru,rv,pw,col,wt in rings:
  v=unit(vh-d*(vh@d)); u=np.cross(v,d); ids=[]
  for q in range(k):
   th=2*math.pi*q/k; cs,sn=math.cos(th),math.sin(th)
   e=2/pw; pt=centre+u*ru*np.sign(cs)*abs(cs)**e+v*rv*np.sign(sn)*abs(sn)**e
   ids.append(len(HV)); HV.append(pt); HUV.append(pal(col)); HW.append(wt)
  ring_ids.append(ids)
 for r0,r1 in zip(ring_ids,ring_ids[1:]):
  for q in range(k): a,b_,c,d_=r0[q],r0[(q+1)%k],r1[q],r1[(q+1)%k]; HF.extend([(a,b_,c),(b_,d_,c)])
 for ids,pole,(centre,d,*_ ,col,wt),flip in [(ring_ids[0],start,rings[0],True),(ring_ids[-1],end,rings[-1],False)]:
  if pole is None: continue
  pid=len(HV); HV.append(centre+d*pole); HUV.append(pal(col)); HW.append(wt)
  for q in range(k): a,b_=ids[q],ids[(q+1)%k]; HF.append((pid,b_,a) if flip else (pid,a,b_))
def ramp(chain,x):
 """chain: [(bone, x)] control points along a digit; weights blend smoothly between different bones."""
 if x<=chain[0][1]: return {chain[0][0]:1.}
 for (b0,x0),(b1,x1) in zip(chain,chain[1:]):
  if x<=x1:
   t=float(smooth((x-x0)/(x1-x0))); return {b0:1.} if b0==b1 else {b0:1-t,b1:t}
 return {chain[-1][0]:1.}
def build_hand(side):
 W_,f,t,n=frame(side); L=lambda a,b_=0,c=0: W_+f*a+t*b_+n*c
 hand,fore='hand'+side,'forearm'+side
 # Wrapped wrist and palm: starts inside the cuff, ends round the knuckles.
 wrap=[(-.026,.030,.014),(-.014,.031,.016),(-.004,.034,.020),(.006,.035,.021),(.016,.034,.020),(.03,.038,.018),(.05,.042,.017),(.07,.044,.016),(.086,.045,.015),(.098,.043,.013),(.106,.036,.009)]
 rings=[]
 for k,(a,hb,hc) in enumerate(wrap):
  rings.append((L(a,0,.002),f,n,hb,hc,3.2 if a>.02 else 2.4,2+(k%2) if a<.02 else 2,ramp([(fore,-.02),(hand,.004)],a)))
 loft(rings,14,start=-.004,end=.004)
 for name,back,across,splay,lengths,r in FINGERS:
  pre='f_'+name; j=[J[f'{pre}0{k}{side}'] for k in (1,2,3)]; tip=J[f'{pre}Tip{side}']; d=unit(tip-j[0]); total=np.linalg.norm(tip-j[0])
  p1,p2=lengths[0],lengths[0]+lengths[1]; chain=[(hand,-.006),(pre+'01'+side,.006),(pre+'01'+side,p1-.005),(pre+'02'+side,p1+.005),(pre+'02'+side,p2-.004),(pre+'03'+side,p2+.004)]
  rt=r*.8; tip_r=lambda x: r+(rt-r)*max(0,x)/total
  xs=[-.014,-.005,.002,.008,p1*.55,p1-.004,p1,p1+.004,p1+(p2-p1)*.5,p2-.003,p2,p2+.003,total-rt*1.2,total-rt*.55]
  rings=[(j[0]+d*x,d,n,tip_r(x)*(.92 if x>total-rt*1.3 else 1)*(1.07 if abs(x-p1)<.005 or abs(x-p2)<.004 else 1),tip_r(x)*.86,2,0 if abs(x-p1)>.0015 and abs(x-p2)>.0015 else 1,ramp(chain,x)) for x in xs]
  loft(rings,8,start=None,end=rt*.75)
 (a,b_,c),dv,lengths,radii=THUMB; j=[J[f'thumb0{k}{side}'] for k in (1,2,3)]; tip=J['thumbTip'+side]
 p1,p2,total=lengths[0],lengths[0]+lengths[1],sum(lengths); d=unit(tip-j[0])
 chain=[('thumb01'+side,.0),('thumb01'+side,p1-.006),('thumb02'+side,p1+.006),('thumb02'+side,p2-.005),('thumb03'+side,p2+.005)]
 rad=lambda x: float(np.interp(x,[0,p1,p2,total],radii))
 xs=[-.012,0,.012,p1*.6,p1-.004,p1,p1+.004,p1+(p2-p1)*.5,p2-.003,p2,p2+.003,total-.012,total-.006]
 # The thenar pad is the thick base of thumb01; a thumb's pad faces the palm side.
 loft([(j[0]+d*x,d,n,rad(x)*(1.25 if x<p1*.7 else 1),rad(x)*.86,2,2 if x<.006 else 0,ramp(chain,x)) for x in xs],8,start=-.006,end=.006)
for side in ['L','R']: build_hand(side)
HV=np.array(HV); HUV=np.array(HUV); HF=np.array(HF)
HWm=np.zeros((len(HV),len(names)))
for i,wt in enumerate(HW):
 for nm,w in wt.items(): HWm[i,idx(nm)]+=w
HWm/=HWm.sum(axis=1,keepdims=True)

# ---- the fist: each digit's turn from its open rest, as an axis-angle in the hand's bind frame.
FIST={'index':(1.50,1.70,1.05),'middle':(1.55,1.75,1.05),'ring':(1.62,1.75,1.0),'pinky':(1.70,1.70,.95)}
def axis_angle(q):
 q=q/np.linalg.norm(q); ang=2*math.acos(min(1,abs(q[3]))); ax=q[:3]*np.sign(q[3]); n_=np.linalg.norm(ax); return (ax/n_ if n_>1e-9 else np.array([1.,0,0])),ang
def quat(axis,ang): axis=unit(axis); return np.array([*axis*math.sin(ang/2),math.cos(ang/2)])
grip={}
W_,f,t,n=frame('L')
for name,*_ in FINGERS:
 pre='f_'+name; d=unit(J[pre+'TipL']-J[pre+'01L']); ax=unit(np.cross(d,n))
 for k,ang in enumerate(FIST[name]): grip[f'{pre}0{k+1}L']=[*ax.tolist(),ang]
# Thumb: solved so its pad lies across the middle phalanges of the curled index and middle fingers.
def rot(axis,ang):
 x,y,z=unit(np.asarray(axis,float)); c,s_=math.cos(ang),math.sin(ang); C=1-c
 return np.array([[c+x*x*C,x*y*C-z*s_,x*z*C+y*s_],[y*x*C+z*s_,c+y*y*C,y*z*C-x*s_],[z*x*C-y*s_,z*y*C+x*s_,c+z*z*C]])
def chain(names_,turns):
 R=np.eye(3); pts=[J[names_[0]]]
 for (a,b_),(ax,ang) in zip(zip(names_,names_[1:]),turns): R=R@rot(ax,ang); pts.append(pts[-1]+R@(J[b_]-J[a]))
 return pts,R
def mid(name): # centre of a curled finger's middle phalanx
 q=chain([f'f_{name}0{k}L' for k in (1,2,3)]+[f'f_{name}TipL'],[(grip[f'f_{name}0{k}L'][:3],grip[f'f_{name}0{k}L'][3]) for k in (1,2,3)])[0]; return (q[1]+q[2])/2
pad_tip=mid('middle')+n*.019; pad_ip=mid('index')+n*.02
TN=['thumb01L','thumb02L','thumb03L','thumbTipL']; d=unit(J['thumbTipL']-J['thumb01L']); flex=unit(np.cross(d,n))
def thumb(x):
 rv=np.array(x[:3]); ang=np.linalg.norm(rv); return chain(TN,[(rv if ang>1e-9 else [1,0,0],ang),(flex,x[3]),(flex,x[4])])[0]
def cost(x):
 q=thumb(x); return np.sum((q[3]-pad_tip)**2)+np.sum((q[2]-pad_ip)**2)+1e-5*(x[3]**2+x[4]**2)+(max(0,-x[3])+max(0,-x[4])+max(0,x[3]-1.4)+max(0,x[4]-1.4))
rng=np.random.default_rng(7); best=np.array([*(f*.9),.5,.6]); bc=cost(best)
for step in [.4,.2,.1,.05,.02,.01,.005]:
 for _ in range(1500):
  x=best+rng.normal(0,step,5); c=cost(x)
  if c<bc: best,bc=x,c
ang=float(np.linalg.norm(best[:3])); grip['thumb01L']=[*unit(best[:3]).tolist(),ang]; grip['thumb02L']=[*flex.tolist(),float(best[3])]; grip['thumb03L']=[*flex.tolist(),float(best[4])]
THUMB_MISS=float(math.sqrt(bc))
# The right hand mirrors the left: a turn's axis reflects as (x, -y, -z).
for k in list(grip): ax,ay,az,ang=grip[k]; grip[k[:-1]+'R']=[ax,-ay,-az,ang]

# ---- combine body and hands; export as the game GLB (bone order and joints in extras, standard skin).
# Body vertices are split again at UV seams for glTF.
corner=np.column_stack((F.ravel(),np.round(corner_uv.reshape(-1,2)*1e6).astype(np.int64)))
_,cfirst,cinv=np.unique(corner,axis=0,return_index=True,return_inverse=True); cinv=cinv.ravel()
BV=V[F.ravel()[cfirst]]; BUV=corner_uv.reshape(-1,2)[cfirst]; BW=W[F.ravel()[cfirst]]; BF=cinv.reshape(-1,3)
AP=np.vstack((BV,HV)); AUV=np.vstack((BUV,HUV)); AW=np.vstack((BW,HWm)); AF=np.vstack((BF,HF+len(BV)))
# Smooth normals on welded positions so seams shade as one surface.
keys=np.round(AP*1e5).astype(np.int64); _,inv=np.unique(keys,axis=0,return_inverse=True); inv=inv.ravel(); acc=np.zeros((inv.max()+1,3))
fn=np.cross(AP[AF[:,1]]-AP[AF[:,0]],AP[AF[:,2]]-AP[AF[:,0]])
for k in range(3): np.add.at(acc,inv[AF[:,k]],fn)
normal=acc[inv]; normal/=np.maximum(np.linalg.norm(normal,axis=1,keepdims=True),1e-9)
order=np.argsort(-AW,axis=1)[:,:4]; weight=np.take_along_axis(AW,order,axis=1); weight/=weight.sum(axis=1,keepdims=True)

# Editable source: one mesh (body + hands), vertex groups, armature modifier, packed texture.
bpy.data.objects.remove(obj,do_unlink=True)
mesh=bpy.data.meshes.new('Jai fighter mesh'); mesh.from_pydata([world(v) for v in AP],[],AF.tolist()); mesh.update()
obj=bpy.data.objects.new('Jai fighter',mesh); bpy.context.collection.objects.link(obj); obj.parent=rig
uv=mesh.uv_layers.new(name='UVMap')
for poly in mesh.polygons:
 poly.use_smooth=True
 for loop in poly.loop_indices: u_,v_=AUV[mesh.loops[loop].vertex_index]; uv.data[loop].uv=(float(u_),float(1-v_))
mat=bpy.data.materials.new('Jai colours'); mat.use_nodes=True; tn=mat.node_tree.nodes.new('ShaderNodeTexImage'); tn.image=paint
bsdf=mat.node_tree.nodes['Principled BSDF']; mat.node_tree.links.new(tn.outputs['Color'],bsdf.inputs['Base Color']); bsdf.inputs['Roughness'].default_value=.85; mesh.materials.append(mat)
for k,name in enumerate(names):
 vg=obj.vertex_groups.new(name='DEF-'+name)
 for i in np.flatnonzero(AW[:,k]>1e-5): vg.add([int(i)],float(AW[i,k]),'REPLACE')
mod=obj.modifiers.new('Game rig','ARMATURE'); mod.object=rig
# The fist as an action on the rig, so it can be edited and previewed in Blender.
rig.animation_data_create(); act=bpy.data.actions.new('Fist'); rig.animation_data.action=act
for name,(ax,ay,az,ang) in grip.items():
 pb=rig.pose.bones['DEF-'+name]; pb.rotation_mode='QUATERNION'
 # Pose rotations are in the bone's own frame; the game stores them in the bind (world-aligned) frame.
 pb.rotation_quaternion=Quaternion(pb.bone.matrix_local.to_3x3().inverted()@Vector(world((ax,ay,az))),ang); pb.keyframe_insert('rotation_quaternion',frame=1)
obj['fighterReady']=True; obj['source']='TRELLIS-style image-to-3D schoolboy, rigged in Blender'; rig['game_bone_order']=json.dumps(names); rig['grip']=json.dumps(grip)

chunks=[];views=[];access=[];offset=0
def view(data,target=None):
 global offset
 data=bytes(data); i=len(views); views.append({'buffer':0,'byteOffset':offset,'byteLength':len(data),**({'target':target} if target else {})}); pad=data+b'\0'*((-len(data))%4); chunks.append(pad); offset+=len(pad); return i
def attribute(array,kind,ctype,target=34962,**kw):
 array=np.ascontiguousarray(array); i=len(access); access.append({'bufferView':view(array.tobytes(),target),'componentType':ctype,'count':len(array),'type':kind,**kw}); return i
attrs={'POSITION':attribute(AP.astype('<f4'),'VEC3',5126,min=AP.min(axis=0).tolist(),max=AP.max(axis=0).tolist()),'NORMAL':attribute(normal.astype('<f4'),'VEC3',5126),'TEXCOORD_0':attribute(AUV.astype('<f4'),'VEC2',5126),'JOINTS_0':attribute(order.astype('u1'),'VEC4',5121),'WEIGHTS_0':attribute(weight.astype('<f4'),'VEC4',5126)}
indices=attribute(AF.reshape(-1,1).astype('<u4'),'SCALAR',5125,34963)
image_view=view(Path(paint.filepath_raw).read_bytes())
ib=np.array([np.eye(4,dtype=np.float32) for _ in names])
for k,name in enumerate(names): ib[k,:3,3]=-J[name]
ib_index=attribute(ib.transpose(0,2,1).reshape(-1,16).astype('<f4'),'MAT4',5126,target=None)
nodes=[{'name':'Jai fighter','mesh':0,'skin':0}]
for name in names:
 node={'name':'DEF-'+name,'translation':(J[name]-J[parent[name]] if name in parent else J[name]).tolist()}; children=[1+names.index(c) for c in names if parent.get(c)==name]
 if children: node['children']=children
 nodes.append(node)
extras={'bones':names,'joints':{k:np.round(v,5).tolist() for k,v in J.items()},'parents':{k:parent[k] for k in names if k in parent},'height':HEIGHT,'fighterReady':True,'grip':grip,
 'breath':{'ribs':[.035,.018,.10],'belly':[-.02,0,-.07]},'rig':{'tool':'Blender '+bpy.app.version_string,'weights':'bone heat, sharpened elbows and knees','hands':'modelled, three joints per finger','textureSize':[1024,1024]}}
out={'asset':{'version':'2.0','generator':'Blender Jai fighter rig'},'scene':0,'scenes':[{'nodes':[0,1]}],'nodes':nodes,'skins':[{'inverseBindMatrices':ib_index,'skeleton':1,'joints':list(range(1,len(names)+1))}],'meshes':[{'name':'Jai fighter','primitives':[{'attributes':attrs,'indices':indices,'material':0}]}],'materials':[{'name':'Jai colours','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':0,'roughnessFactor':1}}],'textures':[{'source':0,'sampler':0}],'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':33071,'wrapT':33071}],'images':[{'bufferView':image_view,'mimeType':'image/jpeg'}],'accessors':access,'bufferViews':views,'buffers':[{'byteLength':offset}],'extras':extras}
j=json.dumps(out,separators=(',',':')).encode(); j+=b' '*((-len(j))%4); binout=b''.join(chunks)
output.write_bytes(struct.pack('<III',0x46546c67,2,28+len(j)+len(binout))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(binout),0x004e4942)+binout)
bpy.context.view_layer.objects.active=obj; obj.select_set(True); bpy.context.preferences.filepaths.save_version=0; bpy.ops.wm.save_as_mainfile(filepath=str(blend),compress=True)
for temp in [src_png,Path(str(output)+'.jpg')]: temp.unlink(missing_ok=True)
print(json.dumps({'bodyVertices':len(V),'handVertices':len(HV),'vertices':len(AP),'triangles':len(AF),'bones':len(names),'bytes':output.stat().st_size,'heatMissed':int(missing.sum()),'thumbMiss':round(THUMB_MISS,4),'thumb':[round(v,3) for v in best]}))
