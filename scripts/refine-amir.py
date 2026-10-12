"""Refine the existing Amir mesh in Blender; preserve his face, UVs and game rig.
Run: blender -b --python scripts/refine-amir.py -- assets/models/amir.glb assets/models/amir-fighter.glb assets/models/amir-fighter.blend
(or `python3 scripts/refine-amir.py -- ...` with the bpy module installed).
v2: the backpack and its straps are gone, the body is a fighter's (broad chest and
shoulders, thick arms and neck, flatter belly) and each hand has a palm, four
three-jointed fingers and a three-jointed thumb on the rig's finger bones.
The game export keeps its custom joint metadata and also supplies a standard glTF skin.
"""
import bpy, json, struct, sys, math
import numpy as np
from pathlib import Path
from mathutils import Vector, Matrix

args=sys.argv[sys.argv.index('--')+1:]
source, output, blend=[Path(p).resolve() for p in args[:3]]
b=source.read_bytes(); size=struct.unpack_from('<I',b,12)[0]
g=json.loads(b[20:20+size]); binary=b[28+size:]
p=g['meshes'][0]['primitives'][0]; extras=g['extras']; names=list(extras['bones']); J={n:np.array(v,dtype=float) for n,v in extras['joints'].items()}
def read(i):
 a=g['accessors'][i]; view=g['bufferViews'][a['bufferView']]; width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
 dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]
 return np.frombuffer(binary,dtype=dtype,count=a['count']*width,offset=view.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],width).copy()
P=read(p['attributes']['POSITION']).astype(float); UV=read(p['attributes']['TEXCOORD_0']); I=read(p['indices']).reshape(-1,3); SI=read(p['attributes']['JOINTS_0']); SW=read(p['attributes']['WEIGHTS_0'])
FINGERS=['thumb','f_index','f_middle','f_ring','f_pinky']
for side in ['L','R']: names+=[f+'0'+str(k)+side for f in FINGERS for k in (1,2,3)]
W=np.zeros((len(P),len(names)),dtype=np.float32)
for k in range(4): W[np.arange(len(P)),SI[:,k]]+=SW[:,k]
original=P.copy(); original_uv=UV.copy(); removed=np.zeros(len(P),dtype=bool)
def unit(v): return v/np.linalg.norm(v)
def smooth(x): return np.clip(x,0,1)**2*(3-2*np.clip(x,0,1))
def curve(y,points): return np.interp(y,[a for a,_ in points],[v for _,v in points])
def group(*bones): return W[:,[names.index(n) for n in bones]].sum(axis=1)
def weights(ids,values,mask):
 W[mask]=0
 for name,value in zip(ids,values): W[mask,names.index(name)]=np.asarray(value)[mask] if np.ndim(value) else value
arm=group(*[n+s for n in ['upper_arm','forearm','hand'] for s in 'LR']); head=group('head')

# Texture as rows from the top, like glTF UVs.
iv=g['bufferViews'][g['images'][0]['bufferView']]; tex=Path(str(output)+'.texture-source.jpg');tex.write_bytes(binary[iv.get('byteOffset',0):iv.get('byteOffset',0)+iv['byteLength']])
image=bpy.data.images.load(str(tex.resolve())); H=image.size[1]
pixels=np.array(image.pixels[:],dtype=np.float32).reshape(H,image.size[0],4)[::-1].copy()
def texel(uv): return pixels[np.clip((uv[:,1]*H).astype(int),0,H-1),np.clip((uv[:,0]*pixels.shape[1]).astype(int),0,pixels.shape[1]-1),:3]
colour=texel(UV); light=colour.mean(axis=1)

# 1. The scanned shirt goes: torso, sleeves, straps and backpack are one
# tangled shell (there is no shirt under the bag). Head, hair, neck, collar,
# the chest logo, jeans and shoes stay as scanned; a clean fighter's torso
# and sleeves are built below.
CZ=.05
ring=np.hypot(P[:,0],P[:,2]-.03); collar=(P[:,1]>=.975)&(ring<.115)
shirt=np.median(colour[(head<.5)&(arm<.3)&(P[:,1]>.7)&(P[:,1]<.95)&(P[:,2]>.12)&(light>.72)],axis=0)
navy=np.median(colour[collar&(colour[:,2]>colour[:,0]+.1)&(light<.5)],axis=0)
removed|=(head<.5)&(P[:,1]>.6)&(P[:,1]<1.058)&~collar
# The ragged scanned collar goes too; a clean navy band replaces it.
removed|=collar&(head<.5)&(P[:,1]<1.058)&(~((colour[:,0]>colour[:,1]+.04)&(colour[:,1]>colour[:,2]+.03))|(P[:,1]<1.005))
removed|=(head<.5)&(arm<.3)&(P[:,1]>.55)&(P[:,2]<-.12)
centre=P[I].mean(axis=1); logo=I[(np.abs(centre[:,0])<.065)&(centre[:,1]>.81)&(centre[:,1]<.93)&(centre[:,2]>.1)]
# Fighter's build: the arms move out with the broader shoulders, the neck thickens.
SHIFT=.026
for side,sign in [('L',1),('R',-1)]:
 for n in ['upper_arm','forearm','hand','handTip']: J[n+side][0]+=sign*SHIFT
neck=(head<.5)*curve(P[:,1],[(.97,0),(1.,.16),(1.035,.16),(1.05,0)])*(ring<.11)
P[:,0]*=1+neck; P[:,2]=.03+(P[:,2]-.03)*(1+neck)
# Torso cross-sections, bottom to top: height, half width, front and back (z).
TORSO=[(.572,.181,.218,-.088),(.61,.177,.212,-.082),(.66,.172,.2,-.073),(.72,.174,.19,-.068),(.79,.188,.188,-.072),(.86,.203,.188,-.082),(.92,.212,.172,-.083),(.96,.205,.146,-.072),(.99,.168,.112,-.047),(1.012,.112,.075,-.012),(1.03,.068,.056,.005)]
def torso_surface(x,y,front=True):
 half,fz,bz=[np.interp(y,[t[0] for t in TORSO],[t[k] for t in TORSO]) for k in (1,2,3)]
 e=(1-np.clip(np.abs(x)/half,0,1)**2.6)**(1/2.6); return CZ+((fz if front else bz)-CZ)*e


# Keep each limb's bend in a short, continuous region around the anatomical joint.
for side in ['L','R']:
 for chain,width in [(['upper_arm','forearm','hand'],.027),(['thigh','shin','foot'],.040)]:
  a,c,d=[n+side for n in chain]; ids=[names.index(n) for n in [a,c,d]]
  mask=W[:,ids].sum(axis=1)>.70
  axis=unit(unit(J[c]-J[a])+unit(J[d]-J[c])); distance=(P-J[c])@axis
  t=smooth((distance+width)/(2*width)); weights([a,c],[1-t,t],mask)
 # Shoes are accessories, not stretchy limbs.
 foot='foot'+side
 mask=(W[:,[names.index(n+side) for n in ['thigh','shin','foot','toe']]].sum(axis=1)>.65)&(P[:,1]<.19)
 weights([foot],[1],mask)
 armw=W[:,[names.index(n+side) for n in ['upper_arm','forearm','hand']]].sum(axis=1)
 upper=J['upper_arm'+side]; elbow=J['forearm'+side]
 # Replace the exposed arm and mitt. The new tube overlaps inside the new sleeve.
 removed|=(armw>.45)&(((P-upper)@unit(elbow-upper))>np.linalg.norm(elbow-upper)*.50)
# The chin belongs to the head, not the neck: rigid weighting prevents the
# face from shearing when a fighter looks away from his turning torso.
mask=(P[:,1]>1.052)&((P[:,2]>-.13)|(P[:,1]>1.09))
weights(['head'],[1],mask)
# The logo is a decal: copies of its scanned triangles lie just on the new chest.
decal=np.unique(logo); local=np.searchsorted(decal,logo); DP=P[decal].copy(); DUV=UV[decal].copy(); DP[:,2]=torso_surface(DP[:,0],DP[:,1])+.0015
used=np.zeros(len(P),dtype=bool); used[I.ravel()]=True; removed|=~used
keep=~removed; remap=np.full(len(P),-1); remap[keep]=np.arange(keep.sum()); I=remap[I[np.all(keep[I],axis=1)]]
P=P[keep]; UV=UV[keep]; W=W[keep]
I=np.vstack((I,local+len(P))); P=np.vstack((P,DP)); UV=np.vstack((UV,DUV)); W=np.vstack((W,np.zeros((len(DP),len(names)),dtype=np.float32)))
spine=[('hips',.651),('spine001',.757),('spine002',.847),('spine003',.938),('neck',1.021)]
def spine_weights(y):
 v=np.zeros(len(names),dtype=np.float32); hs=[h for _,h in spine]; k=int(np.clip(np.searchsorted(hs,y)-1,0,len(spine)-2)); t=float(np.clip((y-hs[k])/(hs[k+1]-hs[k]),0,1))
 v[names.index(spine[k][0])]+=1-t; v[names.index(spine[k+1][0])]+=t; return v
W[-len(DP):]=[spine_weights(y) for y in DP[:,1]]

bpy.ops.wm.read_factory_settings(use_empty=True)
# A 32px palette strip (skin, wrap, shirt, navy) fits the new torso, arms and hands into the same single 1024px texture.
image=bpy.data.images.new('Amir source',width=1024,height=1024,alpha=False); image.pixels=pixels[::-1].ravel().tolist(); image.scale(992,1024)
squeezed=np.array(image.pixels[:],dtype=np.float32).reshape(1024,992,4)
atlas=np.ones((1024,1024,4),dtype=np.float32);atlas[:,:992]=squeezed
sample=texel(original_uv)
skin_mask=(original[:,1]>.62)&(arm>.45)&(original[:,1]<.85)&(sample[:,0]>sample[:,1]+.04)&(sample[:,1]>sample[:,2]+.04)
skin=tuple(np.median(sample[skin_mask],axis=0));wrap=(.91,.88,.81);
for i,col in enumerate([skin,wrap,shirt,navy]): atlas[i*256:(i+1)*256,992:,:3]=col
paint=bpy.data.images.new('Amir fighter atlas',width=1024,height=1024,alpha=False);paint.pixels=atlas.ravel().tolist();paint.filepath_raw=str(Path(str(output)+'.jpg').resolve());paint.file_format='JPEG';paint.save();paint.pack()
UV[:,0]*=992/1024
palette=[(1008/1024,1-(i*256+128)/1024) for i in range(4)]

def world(p): return (float(p[0]),float(-p[2]),float(p[1]))
def bone_weights(**w):
 v=np.zeros(len(names),dtype=np.float32)
 for n,x in w.items(): v[names.index(n)]+=x
 return v
def add(points,faces,wts,col=0):
 global P,UV,W,I
 points=np.asarray(points,dtype=float);faces=np.asarray(faces)
 # Faces point outward: flip the whole piece if its signed volume is negative.
 c=points-points.mean(axis=0)
 if np.einsum('ij,ij->i',c[faces[:,0]],np.cross(c[faces[:,1]],c[faces[:,2]])).sum()<0: faces=faces[:,::-1]
 I=np.vstack((I,faces+len(P)));P=np.vstack((P,points));UV=np.vstack((UV,np.tile(palette[col],(len(points),1))));W=np.vstack((W,np.asarray(wts,dtype=np.float32)))
def loft(rings,sides,cap=True):
 """rings: [(centre, u, v, ru, rv, weights)]; a closed tube with a pole at each end."""
 points=[];wts=[];faces=[]
 for centre,u,v,ru,rv,w in rings:
  for q in range(sides): th=q*2*math.pi/sides;points.append(centre+ru*math.cos(th)*u+rv*math.sin(th)*v);wts.append(w)
 for k in range(len(rings)-1):
  for q in range(sides): a=k*sides+q;b=k*sides+(q+1)%sides;faces+=[(a,b,a+sides),(b,b+sides,a+sides)]
 if cap:
  ends=[(rings[0],rings[0][0]-unit(rings[1][0]-rings[0][0])*min(rings[0][3],rings[0][4])*.7,0),(rings[-1],rings[-1][0]+unit(rings[-1][0]-rings[-2][0])*min(rings[-1][3],rings[-1][4])*.9,len(rings)-1)]
  for (ring,pole,k) in ends:
   i=len(points);points.append(pole);wts.append(ring[5])
   for q in range(sides): a=k*sides+q;b=k*sides+(q+1)%sides;faces.append((b,a,i) if k==0 else (a,b,i))
 return points,faces,wts
def frame(d):
 d=unit(d);u=unit(np.cross(d,np.array([0.,0.,1.]))) if abs(d[2])<.9 else unit(np.cross(d,np.array([1.,0.,0.])));return u,unit(np.cross(d,u))
# Torso: superellipse rings (boxy, broad chest, flat belly), closed top and bottom.
sides=32; pts=[]; wts=[]; faces=[]
for y,half,fz,bz in TORSO:
 for q in range(sides):
  th=q*2*math.pi/sides; c,s=math.cos(th),math.sin(th); x=half*math.copysign(abs(c)**(2/2.6),c); z=CZ+((fz if s>0 else bz)-CZ)*abs(s)**(2/2.6)
  pts.append(np.array([x,y,z])); wts.append(spine_weights(y))
for k in range(len(TORSO)-1):
 for q in range(sides): a=k*sides+q;b=k*sides+(q+1)%sides;faces+=[(a,b,a+sides),(b,b+sides,a+sides)]
for k,y in [(0,TORSO[0][0]-.012),(len(TORSO)-1,TORSO[-1][0]+.01)]:
 i=len(pts);pts.append(np.array([0,y,CZ]));wts.append(spine_weights(y))
 for q in range(sides): a=k*sides+q;b=k*sides+(q+1)%sides;faces.append((b,a,i) if k==0 else (a,b,i))
add(pts,faces,wts,col=2)
# Collar: a navy rib round the neck, dipping a little at the front.
rib=[]
for q in range(24):
 th=q*2*math.pi/24; c=np.array([.08*math.cos(th),1.021-.01*max(0,math.sin(th)),.03+.06*math.sin(th)])
 out=unit(np.array([math.cos(th)/.08,0,math.sin(th)/.06])); rib.append((c,out,np.array([0,1.,0]),.012,.009,spine_weights(1.02)))
pts,faces,wts=loft(rib+rib[:1],8,cap=False); add(pts[:-8],[(a%(24*8),b%(24*8),c%(24*8)) for a,b,c in faces],wts[:-8],col=3)
for side in ['L','R']:
 # Sleeves: a rounded shoulder cap and a short, wide sleeve with a navy trim.
 a=J['upper_arm'+side]; d=unit(J['forearm'+side]-a); u,v=frame(d); upper=bone_weights(**{'upper_arm'+side:1})
 add(*loft([(a+d*s,u,v,r,r*.94,upper) for s,r in [(-.045,.03),(-.03,.055),(-.01,.066),(.025,.069),(.07,.066),(.112,.064)]],14),col=2)
 add(*loft([(a+d*s,u,v,r,r*.94,upper) for s,r in [(.1,.0655),(.108,.0665),(.118,.0665),(.124,.064)]],14),col=3)
 # Thick arms: a clean ring topology keeps forearms straight and gives the elbow enough loops.
 a=J['upper_arm'+side]; elbow=J['forearm'+side]; wrist=J['hand'+side]; axis=unit(unit(elbow-a)+unit(wrist-elbow)); rings=[]
 sites=[(a+(elbow-a)*t,r) for t,r in [(.43,.056),(.55,.057),(.68,.054),(.82,.047),(.95,.042)]]+[(elbow,.041)]
 sites+=[(elbow+(wrist-elbow)*t,r) for t,r in [(.07,.042),(.2,.045),(.4,.043),(.65,.037),(.88,.031),(1.,.03)]]
 for k,(centre,radius) in enumerate(sites):
  u,v=frame(sites[min(k+1,len(sites)-1)][0]-sites[max(0,k-1)][0]);t=float(smooth((np.dot(centre-elbow,axis)+.027)/.054))
  rings.append((centre,u,v,radius,radius,bone_weights(**{'upper_arm'+side:1-t,'forearm'+side:t})))
 add(*loft(rings,12,cap=False)[:2],[r[5] for r in rings for _ in range(12)])
 # Hand frame at bind: fingers along F, palm toward the body (+p), thumb forward (+t).
 F=unit(J['handTip'+side]-wrist); palm=np.array([-1. if side=='L' else 1.,0.,0.]); palm=unit(palm-F*np.dot(palm,F)); thumb=unit(np.cross(palm,F))
 if thumb[2]<0: thumb=-thumb
 at=lambda f,t=0,q=0: wrist+F*f+thumb*t+palm*q
 hand=bone_weights(**{'hand'+side:1}); half=bone_weights(**{'hand'+side:.5,'forearm'+side:.5})
 # Palm: wrist to knuckles, wider and flatter toward the knuckles.
 add(*loft([(at(f,0,q),thumb,palm,w,h,wt) for f,q,w,h,wt in [(-.004,0,.027,.021,half),(.016,0,.032,.018,hand),(.036,-.001,.035,.017,hand),(.05,-.003,.034,.014,hand)]],10),col=0)
 # Fingers: three phalanges each; a joint ring is shared half and half by
 # its two bones, the rest of a phalanx is rigid.
 for name,t,scale,r in [('f_index',.025,1.,.0095),('f_middle',.0083,1.07,.0098),('f_ring',-.0083,1.,.0093),('f_pinky',-.025,.84,.0083)]:
  segs=[.021*scale,.014*scale,.012*scale]; base=at(.048,t,-.003); d=unit(F-thumb*t*.6); u,v=thumb,palm
  bones=['hand'+side]+[name+'0'+str(k)+side for k in (1,2,3)]
  J[bones[1]]=base; J[bones[2]]=base+d*segs[0]; J[bones[3]]=base+d*(segs[0]+segs[1]); J[name+'Tip'+side]=base+d*sum(segs)
  rings=[]
  for s,wt,rr in [(-.008,{bones[0]:1},1.),(0,{bones[0]:.5,bones[1]:.5},1.),(segs[0]*.5,{bones[1]:1},.98),(segs[0],{bones[1]:.5,bones[2]:.5},.92),(segs[0]+segs[1]*.5,{bones[2]:1},.9),(segs[0]+segs[1],{bones[2]:.5,bones[3]:.5},.86),(sum(segs)-segs[2]*.35,{bones[3]:1},.84)]:
   rings.append((base+d*s,u,v,r*rr,r*rr*.92,bone_weights(**wt)))
  add(*loft(rings,8))
 # Thumb: a fleshy base in the palm, then two phalanges, angled out and forward.
 bones=['hand'+side]+['thumb0'+str(k)+side for k in (1,2,3)]; base=at(.01,.024,.006); d=unit(F*.75+thumb*.62+palm*.2); u=unit(np.cross(d,palm)); v=unit(np.cross(u,d))
 segs=[.024,.017,.014]; J[bones[1]]=base; J[bones[2]]=base+d*segs[0]; J[bones[3]]=base+d*(segs[0]+segs[1]); J['thumbTip'+side]=base+d*sum(segs)
 rings=[(base+d*s,u,v,r,r*.9,bone_weights(**wt)) for s,wt,r in [(-.006,{bones[0]:1},.013),(.004,{bones[0]:.5,bones[1]:.5},.0135),(segs[0]*.6,{bones[1]:1},.0125),(segs[0],{bones[1]:.5,bones[2]:.5},.0108),(segs[0]+segs[1]*.5,{bones[2]:1},.0105),(segs[0]+segs[1],{bones[2]:.5,bones[3]:.5},.01),(sum(segs)-.006,{bones[3]:1},.0094)]]
 add(*loft(rings,8))
 # Wrist wrap: a short band shared by forearm and hand.
 wristband=bone_weights(**{'hand'+side:.4,'forearm'+side:.6}); u,v=frame(F); add(*loft([(at(f),u,v,r,r*1.1,wristband) for f,r in [(-.026,.0305),(-.018,.0322),(-.006,.0322),(.002,.0305)]],12),col=1)
mesh=bpy.data.meshes.new('Amir solid fighter mesh');mesh.from_pydata([world(v) for v in P],[],I.tolist());mesh.update()
obj=bpy.data.objects.new('Amir fighter',mesh);bpy.context.collection.objects.link(obj)
uv=mesh.uv_layers.new(name='UVMap')
for polygon in mesh.polygons:
 polygon.use_smooth=True
 for loop in polygon.loop_indices:
  u,v=UV[mesh.loops[loop].vertex_index];uv.data[loop].uv=(float(u),float(1-v))
mat=bpy.data.materials.new('Amir original colours');mat.use_nodes=True;n=mat.node_tree.nodes.new('ShaderNodeTexImage');n.image=paint;mat.node_tree.links.new(n.outputs['Color'],mat.node_tree.nodes['Principled BSDF'].inputs['Base Color']);mat.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.85;mesh.materials.append(mat)
parent={'spine001':'hips','spine002':'spine001','spine003':'spine002','neck':'spine003','head':'neck'}
tail={'hips':'spine001','spine001':'spine002','spine002':'spine003','spine003':'neck','neck':'head','head':'headTop'}
for side in ['L','R']:
 for name,par,end in [('shoulder','spine003','upper_arm'),('upper_arm','shoulder','forearm'),('forearm','upper_arm','hand'),('hand','forearm','handTip'),('thigh','hips','shin'),('shin','thigh','foot'),('foot','shin','toe'),('toe','foot','toeTip')]:
  parent[name+side]=par if par=='spine003' or par=='hips' else par+side;tail[name+side]=end+side
 for f in FINGERS:
  for k in (1,2,3): parent[f+'0'+str(k)+side]=('hand' if k==1 else f+'0'+str(k-1))+side; tail[f+'0'+str(k)+side]=(f+'0'+str(k+1) if k<3 else f+'Tip')+side
arm=bpy.data.armatures.new('Amir fitted rig');rig=bpy.data.objects.new('Amir rig',arm);bpy.context.collection.objects.link(rig);bpy.context.view_layer.objects.active=rig;rig.select_set(True);bpy.ops.object.mode_set(mode='EDIT')
for name in names:
 bone=arm.edit_bones.new('DEF-'+name);bone.head=world(J[name]);bone.tail=world(J[tail[name]])
 if name in parent:bone.parent=arm.edit_bones['DEF-'+parent[name]]
bpy.ops.object.mode_set(mode='OBJECT');rig.show_in_front=True;obj.parent=rig
for k,name in enumerate(names):
 vg=obj.vertex_groups.new(name='DEF-'+name)
 for i in np.flatnonzero(W[:,k]>.00001): vg.add([int(i)],float(W[i,k]),'REPLACE')
mod=obj.modifiers.new('Game rig','ARMATURE');mod.object=rig;mod.use_deform_preserve_volume=False
obj['fighterReady']=True;obj['source']='Existing Amir, refined in Blender';rig['game_bone_order']=json.dumps(names)
# Compute smooth normals on welded positions; UV seams retain the same shading.
normal=np.zeros_like(P); keys=np.round(P*100000).astype(np.int64);_,inv=np.unique(keys,axis=0,return_inverse=True);inv=inv.ravel();weld=np.zeros((int(inv.max())+1,3))
f=np.cross(P[I[:,1]]-P[I[:,0]],P[I[:,2]]-P[I[:,0]])
for k in range(3):np.add.at(weld,inv[I[:,k]],f)
normal=weld[inv];normal/=np.maximum(np.linalg.norm(normal,axis=1,keepdims=True),1e-8)
order=np.argsort(-W,axis=1)[:,:4];weight=np.take_along_axis(W,order,axis=1);weight/=weight.sum(axis=1,keepdims=True)
chunks=[];views=[];access=[];offset=0
def view(data,target=None):
 global offset
 data=bytes(data);i=len(views);views.append({'buffer':0,'byteOffset':offset,'byteLength':len(data),**({'target':target} if target else {})});pad=data+b'\0'*((-len(data))%4);chunks.append(pad);offset+=len(pad);return i
def attribute(array,kind,ctype,target=34962,**kwargs):
 array=np.ascontiguousarray(array);i=len(access);access.append({'bufferView':view(array.tobytes(),target),'componentType':ctype,'count':len(array),'type':kind,**kwargs});return i
P=P.astype('<f4')
attrs={'POSITION':attribute(P,'VEC3',5126,min=P.min(axis=0).tolist(),max=P.max(axis=0).tolist()),'NORMAL':attribute(normal.astype('<f4'),'VEC3',5126),'TEXCOORD_0':attribute(UV.astype('<f4'),'VEC2',5126),'JOINTS_0':attribute(order.astype('u1'),'VEC4',5121),'WEIGHTS_0':attribute(weight.astype('<f4'),'VEC4',5126)}
indices=attribute(I.reshape(-1,1).astype('<u4'),'SCALAR',5125,34963)
image_view=view(Path(paint.filepath_raw).read_bytes())
ib=np.array([np.eye(4,dtype=np.float32) for n in names]);
for k,name in enumerate(names):ib[k,:3,3]=-J[name]
ib_index=attribute(ib.transpose(0,2,1).reshape(-1,16).astype('<f4'),'MAT4',5126,target=None)
nodes=[{'name':'Amir fighter','mesh':0,'skin':0}]
for name in names:
 node={'name':'DEF-'+name,'translation':(J[name]-J[parent[name]] if name in parent else J[name]).tolist()};children=[1+names.index(n) for n in names if parent.get(n)==name]
 if children:node['children']=children
 nodes.append(node)
extras={**extras,'bones':names,'joints':{n:[round(float(c),5) for c in v] for n,v in J.items()},'fighterReady':True,'refinement':{'tool':'Blender','version':2,'backpack':False,'build':'fighter','fingers':FINGERS,'jointWeights':'localized','textureSize':[1024,1024]}}
out={'asset':{'version':'2.0','generator':'Blender Amir fighter refinement'},'scene':0,'scenes':[{'nodes':[0,1]}],'nodes':nodes,'skins':[{'inverseBindMatrices':ib_index,'skeleton':1,'joints':list(range(1,len(names)+1))}],'meshes':[{'name':'Amir fighter','primitives':[{'attributes':attrs,'indices':indices,'material':0}]}],'materials':[{'name':'Amir original colours','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':0,'roughnessFactor':1}}],'textures':[{'source':0,'sampler':0}],'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':33071,'wrapT':33071}],'images':[{'bufferView':image_view,'mimeType':'image/jpeg'}],'accessors':access,'bufferViews':views,'buffers':[{'byteLength':offset}],'extras':extras}
j=json.dumps(out,separators=(',',':')).encode();j+=b' '*((-len(j))%4);binout=b''.join(chunks);output.write_bytes(struct.pack('<III',0x46546c67,2,28+len(j)+len(binout))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(binout),0x004e4942)+binout)
# Embedded texture and fitted rig make the .blend usable without any external files.
bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.wm.save_as_mainfile(filepath=str(blend.resolve()),compress=True)
for temp in [tex,Path(str(output)+'.jpg')]:temp.unlink(missing_ok=True)
print(json.dumps({'sourceVertices':len(original),'removedVertices':int(removed.sum()),'vertices':len(P),'triangles':len(I),'bones':len(names),'bytes':output.stat().st_size,'blend':str(blend)}))
