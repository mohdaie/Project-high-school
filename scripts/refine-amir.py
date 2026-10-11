"""Refine the existing Amir mesh in Blender; preserve his face, UVs and game rig.
Run: blender -b --python scripts/refine-amir.py -- assets/models/amir.glb assets/models/amir-fighter.glb assets/models/amir-fighter.blend
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
p=g['meshes'][0]['primitives'][0]; extras=g['extras']; names=extras['bones']; J={n:np.array(v,dtype=float) for n,v in extras['joints'].items()}
def read(i):
 a=g['accessors'][i]; view=g['bufferViews'][a['bufferView']]; width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
 dtype={5126:'<f4',5125:'<u4',5123:'<u2',5121:'u1'}[a['componentType']]
 return np.frombuffer(binary,dtype=dtype,count=a['count']*width,offset=view.get('byteOffset',0)+a.get('byteOffset',0)).reshape(a['count'],width).copy()
P=read(p['attributes']['POSITION']); UV=read(p['attributes']['TEXCOORD_0']); I=read(p['indices']).reshape(-1,3); SI=read(p['attributes']['JOINTS_0']); SW=read(p['attributes']['WEIGHTS_0'])
W=np.zeros((len(P),len(names)),dtype=np.float32)
for k in range(4): W[np.arange(len(P)),SI[:,k]]+=SW[:,k]
original=P.copy(); original_uv=UV.copy(); removed=np.zeros(len(P),dtype=bool)
def unit(v): return v/np.linalg.norm(v)
def smooth(x): return np.clip(x,0,1)**2*(3-2*np.clip(x,0,1))
def weights(ids,values,mask):
 W[mask]=0
 for name,value in zip(ids,values): W[mask,names.index(name)]=np.asarray(value)[mask] if np.ndim(value) else value
# Keep each limb's bend in a short, continuous region around the anatomical joint.
for side in ['L','R']:
 for chain,width in [(['upper_arm','forearm','hand'],.027),(['thigh','shin','foot'],.040)]:
  a,c,d=[n+side for n in chain]; ids=[names.index(n) for n in [a,c,d]]
  mask=W[:,ids].sum(axis=1)>.70
  axis=unit(unit(J[c]-J[a])+unit(J[d]-J[c])); distance=(P-J[c])@axis
  t=smooth((distance+width)/(2*width)); weights([a,c],[1-t,t],mask)
 # Shoes and backpack are accessories, not stretchy limbs.
 foot=side and 'foot'+side; toe='toe'+side
 mask=(W[:,[names.index(n+side) for n in ['thigh','shin','foot','toe']]].sum(axis=1)>.65)&(P[:,1]<.19)
 weights([foot],[1],mask)
 arm=W[:,[names.index(n+side) for n in ['upper_arm','forearm','hand']]].sum(axis=1)
 distal=(P-J['hand'+side])@unit(J['hand'+side]-J['forearm'+side])
 upper=J['upper_arm'+side]; elbow=J['forearm'+side]
 # Replace the irregular exposed arm too. The new tube overlaps inside the sleeve.
 removed|=(arm>.45)&(((P-upper)@unit(elbow-upper))>np.linalg.norm(elbow-upper)*.50)
mask=(P[:,2]<-.13)&(P[:,1]>.53)&(P[:,1]<1.09)
weights(['spine003'],[1],mask)
# The chin belongs to the head, not the neck: rigid weighting prevents the
# face from shearing when a fighter looks away from his turning torso.
mask=(P[:,1]>1.052)&((P[:,2]>-.13)|(P[:,1]>1.09))
weights(['head'],[1],mask)
keep=~removed; remap=np.full(len(P),-1); remap[keep]=np.arange(keep.sum()); I=remap[I[np.all(keep[I],axis=1)]]
P=P[keep]; UV=UV[keep]; W=W[keep]

bpy.ops.wm.read_factory_settings(use_empty=True)
# A 32px palette strip fits new hands into the same single 1024px texture.
iv=g['bufferViews'][g['images'][0]['bufferView']]; tex=Path(str(output)+'.texture-source.jpg');tex.write_bytes(binary[iv.get('byteOffset',0):iv.get('byteOffset',0)+iv['byteLength']])
image=bpy.data.images.load(str(tex.resolve())); image.scale(992,1024)
pixels=np.array(image.pixels[:],dtype=np.float32).reshape(1024,992,4)
atlas=np.ones((1024,1024,4),dtype=np.float32);atlas[:,:992]=pixels
sample=pixels[np.clip(((1-original_uv[:,1])*1023).astype(int),0,1023),np.clip((original_uv[:,0]*991).astype(int),0,991),:3]
skin_mask=removed&(original[:,1]>.62)&(sample[:,0]>sample[:,1]+.04)&(sample[:,1]>sample[:,2]+.04)
skin=tuple(np.median(sample[skin_mask],axis=0));wrap=(.91,.88,.81);crease=tuple(float(c*.76) for c in skin)
for i,col in enumerate([skin,wrap,crease]): atlas[i*341:(i+1)*341 if i<2 else 1024,992:,:3]=col
paint=bpy.data.images.new('Amir fighter atlas',width=1024,height=1024,alpha=False);paint.pixels=atlas.ravel().tolist();paint.filepath_raw=str(Path(str(output)+'.jpg').resolve());paint.file_format='JPEG';paint.save();paint.pack()
UV[:,0]*=992/1024
palette=[(1008/1024,1-(i*341+170)/1024) for i in range(3)]

def world(p): return (float(p[0]),float(-p[2]),float(p[1]))
def game(v): return np.array([v.x,v.z,-v.y])
# Build knuckles, folded fingers and thumb as low-poly rounded solids in Blender.
new=[]
for side in ['L','R']:
 # A clean ring topology keeps forearms straight and gives the elbow enough loops.
 a=J['upper_arm'+side]; elbow=J['forearm'+side]; wrist=J['hand'+side]
 sites=[(a+(elbow-a)*t,r) for t,r in [(.43,.045),(.55,.043),(.75,.039),(.88,.036),(.95,.035)]]
 sites += [(elbow,.035)]
 sites += [(elbow+(wrist-elbow)*t,r) for t,r in [(.07,.035),(.16,.034),(.38,.034),(.65,.030),(.88,.026),(1.,.025)]]
 axis=unit(unit(elbow-a)+unit(wrist-elbow)); limb_points=[]; limb_weights=[]; circumference=12
 for k,(centre,radius) in enumerate(sites):
  direction=unit((sites[min(k+1,len(sites)-1)][0]-sites[max(0,k-1)][0])); u=unit(np.cross(direction,np.array([0.,0.,1.])));v=unit(np.cross(direction,u))
  for q in range(circumference):
   theta=q*2*math.pi/circumference;point=centre+radius*(u*math.cos(theta)+v*math.sin(theta));limb_points.append(point)
   t=float(smooth((np.dot(point-elbow,axis)+.027)/.054));w=np.zeros(len(names));w[names.index('upper_arm'+side)]=1-t;w[names.index('forearm'+side)]=t;limb_weights.append(w)
 start=len(P);faces=[]
 for k in range(len(sites)-1):
  for q in range(circumference):
   aa=start+k*circumference+q;bb=start+k*circumference+(q+1)%circumference;cc=aa+circumference;dd=bb+circumference;faces.extend([(aa,bb,cc),(bb,dd,cc)])
 P=np.vstack((P,np.array(limb_points,dtype=np.float32)));UV=np.vstack((UV,np.tile(palette[0],(len(limb_points),1))));W=np.vstack((W,np.array(limb_weights,dtype=np.float32)));I=np.vstack((I,np.array(faces)))
 wrist=J['hand'+side]; forward=unit(wrist-J['forearm'+side]); palm=np.array([-1 if side=='L' else 1,0.,0.]);palm=unit(palm-forward*np.dot(palm,forward));thumb=unit(np.cross(palm,forward));
 if thumb[2]<0: thumb=-thumb
 basis=np.column_stack((palm,forward,thumb)); parts=[]
 def ellipsoid(name,centre,radii,col=0,segments=10,rings=6):
  bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,radius=1)
  o=bpy.context.object;o.name=name
  for v in o.data.vertices: v.co=world(wrist+basis@(np.array(centre)+np.array(v.co)*radii))
  # Mirroring the right-hand basis reverses orientation; reverse faces too.
  if np.linalg.det(basis)<0:
   for face in o.data.polygons: face.flip()
  parts.append((o,col))
 ellipsoid('Palm '+side,(0,.030,0),(.027,.043,.034))
 for k in range(4):
  z=-.027+k*.018
  ellipsoid('Folded finger '+side+str(k),(.010,.054,z),(.022,.029,.0105),segments=8,rings=5)
  ellipsoid('Knuckle '+side+str(k),(-.012,.073,z),(.012,.012,.011),segments=8,rings=4)
 ellipsoid('Thumb '+side,(.030,.039,.018),(.012,.028,.013),segments=8,rings=5)
 ellipsoid('Wrist wrap '+side,(0,-.004,0),(.032,.027,.035),col=1)
 # Three slim grooves on the rolled fingers read as a fist at phone scale.
 for k in range(3): ellipsoid('Finger crease '+side+str(k),(.028,.062,-.018+k*.018),(.0014,.012,.0012),col=2,segments=6,rings=4)
 for o,col in parts:
  mesh=o.data; mesh.calc_loop_triangles(); start=len(P); points=np.array([game(v.co) for v in mesh.vertices],dtype=np.float32)
  P=np.vstack((P,points));UV=np.vstack((UV,np.tile(palette[col],(len(points),1))));add=np.zeros((len(points),len(names)),dtype=np.float32);add[:,names.index('forearm'+side)]=1;W=np.vstack((W,add));I=np.vstack((I,np.array([t.vertices for t in mesh.loop_triangles])+start));bpy.data.objects.remove(o,do_unlink=True)
# One mesh and one material in both the editable source and the mobile export.
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
normal=np.zeros_like(P); keys=np.round(P*100000).astype(np.int64);_,inv=np.unique(keys,axis=0,return_inverse=True);weld=np.zeros((int(inv.max())+1,3),dtype=np.float32)
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
attrs={'POSITION':attribute(P.astype('<f4'),'VEC3',5126,min=P.min(axis=0).tolist(),max=P.max(axis=0).tolist()),'NORMAL':attribute(normal.astype('<f4'),'VEC3',5126),'TEXCOORD_0':attribute(UV.astype('<f4'),'VEC2',5126),'JOINTS_0':attribute(order.astype('u1'),'VEC4',5121),'WEIGHTS_0':attribute(weight.astype('<f4'),'VEC4',5126)}
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
extras={**extras,'fighterReady':True,'refinement':{'tool':'Blender','version':1,'integratedFists':True,'jointWeights':'localized','textureSize':[1024,1024]}}
out={'asset':{'version':'2.0','generator':'Blender Amir fighter refinement'},'scene':0,'scenes':[{'nodes':[0,1]}],'nodes':nodes,'skins':[{'inverseBindMatrices':ib_index,'skeleton':1,'joints':list(range(1,len(names)+1))}],'meshes':[{'name':'Amir fighter','primitives':[{'attributes':attrs,'indices':indices,'material':0}]}],'materials':[{'name':'Amir original colours','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':0,'roughnessFactor':1}}],'textures':[{'source':0,'sampler':0}],'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':33071,'wrapT':33071}],'images':[{'bufferView':image_view,'mimeType':'image/jpeg'}],'accessors':access,'bufferViews':views,'buffers':[{'byteLength':offset}],'extras':extras}
j=json.dumps(out,separators=(',',':')).encode();j+=b' '*((-len(j))%4);binout=b''.join(chunks);output.write_bytes(struct.pack('<III',0x46546c67,2,28+len(j)+len(binout))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(binout),0x004e4942)+binout)
# Embedded texture and fitted rig make the .blend usable without any external files.
bpy.context.view_layer.objects.active=obj;obj.select_set(True);bpy.ops.wm.save_as_mainfile(filepath=str(blend.resolve()),compress=True)
for temp in [tex,Path(str(output)+'.jpg')]:temp.unlink(missing_ok=True)
print(json.dumps({'sourceVertices':len(original),'removedHandVertices':int(removed.sum()),'vertices':len(P),'triangles':len(I),'bytes':output.stat().st_size,'blend':str(blend)}))
