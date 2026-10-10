import * as T from 'three';

// Shared three-step light ramp: geometry remains interactive in 3D while the
// surfaces read as inked colour blocks rather than polished plastic.
const ramp = new T.DataTexture(new Uint8Array([65,65,65,255, 155,155,155,255, 255,255,255,255]), 3, 1, T.RGBAFormat);
ramp.minFilter = ramp.magFilter = T.NearestFilter;
ramp.generateMipmaps = false; ramp.needsUpdate = true;
export function toon(color, options = {}) {
  const material=new T.MeshToonMaterial({ color, gradientMap: ramp, ...options });
  material.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      // Subtle printed dots in shade, in screen space like an animation cels'
      // print layer. No fullscreen postprocessing targets on mobile.
      float inkShade=clamp(1.0-dot(reflectedLight.directDiffuse,vec3(.2126,.7152,.0722))/(dot(diffuseColor.rgb,vec3(.2126,.7152,.0722))+.001),0.0,1.0);
      vec2 inkCell=fract(gl_FragCoord.xy/5.0)-.5;
      float inkDot=1.0-smoothstep(.15,.22,length(inkCell));
      outgoingLight*=1.0-.10*inkDot*inkShade;
      #include <opaque_fragment>
    `);
  };
  material.customProgramCacheKey=()=> 'illustrated-halftone-v1';
  return material;
}
export const inkViewport = new T.Vector2(1,1);
// Character hulls keep a steady on-screen weight: the push along the view
// normal is measured in CSS pixels, so the close chase camera and distant
// NPCs both read with the same ink line. Capped in metres for extreme zooms.
const ink = new T.ShaderMaterial({
  uniforms: { color: { value: new T.Color(0x242332) }, width: { value: 1.6 }, viewport: { value: inkViewport } },
  vertexShader: `#include <common>
    #include <skinning_pars_vertex>
    uniform float width; uniform vec2 viewport;
    void main(){
      #include <beginnormal_vertex>
      #include <skinbase_vertex>
      #include <skinnormal_vertex>
      #include <begin_vertex>
      #include <skinning_vertex>
      vec4 view=modelViewMatrix*vec4(transformed,1.0);
      float depth=mix(max(-view.z,.1),1.0,projectionMatrix[3][3]);
      float perPixel=2.0*depth/(projectionMatrix[1][1]*max(viewport.y,1.0));
      view.xyz+=normalize(normalMatrix*objectNormal)*min(width*perPixel,.03);
      gl_Position=projectionMatrix*view;
    }`,
  fragmentShader: `uniform vec3 color; void main(){gl_FragColor=vec4(color,1.0);
#include <colorspace_fragment>
}`,
  side: T.BackSide
});
const inks = new Map();
// Use a hull only for characters. Town ink uses batched crease lines, avoiding
// a second opaque pass over the entire scene. Width is in CSS pixels.
export function outline(mesh, width = 1.6) {
  if (!inks.has(width)) { const material = ink.clone(); material.uniforms.width.value = width; material.uniforms.viewport.value = inkViewport; inks.set(width, material); }
  // Skinned characters share their skeleton, so the hull follows every joint.
  const hull = mesh.isSkinnedMesh ? new T.SkinnedMesh(mesh.geometry, inks.get(width)) : new T.Mesh(mesh.geometry, inks.get(width));
  if (mesh.isSkinnedMesh) hull.bind(mesh.skeleton, mesh.bindMatrix);
  hull.position.copy(mesh.position); hull.quaternion.copy(mesh.quaternion); hull.scale.copy(mesh.scale);
  hull.userData.ink = true; mesh.parent.add(hull);
}

// Triangle ribbons give real CSS-pixel thickness on WebGL, where ordinary
// line widths are usually fixed at one pixel. One draw call per spatial batch.
export const inkFog = new T.Vector2(95,230);
export function comicEdges(edges, width=2.5) {
  const source=edges.attributes.position.array, positions=[], other=[], sides=[];
  for(let i=0;i<source.length;i+=6){
    const a=Array.from(source.slice(i,i+3)), b=Array.from(source.slice(i+3,i+6));
    for(const corner of [0,1,2,2,1,3]){
      positions.push(...(corner<2?a:b));other.push(...(corner<2?b:a));
      sides.push([-1,1,1,-1][corner]);
    }
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('other',new T.Float32BufferAttribute(other,3));
  geometry.setAttribute('inkSide',new T.Float32BufferAttribute(sides,1));
  geometry.computeBoundingSphere();edges.dispose();
  const material=new T.ShaderMaterial({
    uniforms:{viewport:{value:inkViewport},fogRange:{value:inkFog},width:{value:width},inkOpacity:{value:1}},
    vertexShader:`attribute vec3 other; attribute float inkSide;
      uniform vec2 viewport; uniform float width; varying float depth;
      void main(){
        vec4 view=modelViewMatrix*vec4(position,1.0);
        vec4 clip=projectionMatrix*view;
        vec4 endpoint=projectionMatrix*modelViewMatrix*vec4(other,1.0);
        vec2 delta=(endpoint.xy/max(endpoint.w,.001)-clip.xy/max(clip.w,.001))*viewport;
        vec2 tangent=delta/max(length(delta),.001);
        clip.xy+=vec2(-tangent.y,tangent.x)*inkSide*width/viewport*clip.w;
        clip.z-=.00001*clip.w; gl_Position=clip;depth=-view.z;
      }`,
    fragmentShader:`uniform float inkOpacity;uniform vec2 fogRange;varying float depth;
      void main(){gl_FragColor=vec4(mix(vec3(.012,.010,.018),vec3(.57,.71,.75),smoothstep(fogRange.x,fogRange.y,depth)),inkOpacity);
        #include <colorspace_fragment>
      }`,
    transparent:true,depthWrite:false,side:T.DoubleSide
  });
  return new T.Mesh(geometry,material);
}
