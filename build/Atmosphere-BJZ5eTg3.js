import{a as c,j as p}from"./react-B8AvdffO.js";import{p as b,a as C}from"./index-_-wWf4KP.js";import{u as A,a as g}from"./r3f-BrMSz51N.js";import{ae as P,af as T,ag as S,ab as j,C as h,e as F,D as U,a6 as v}from"./three-DiKlxm4n.js";function D(o){return function(){o|=0,o=o+1831565813|0;let e=Math.imul(o^o>>>15,1|o);return e=e+Math.imul(e^e>>>7,61|e)^e,((e^e>>>14)>>>0)/4294967296}}function z({count:o,spread:e=16,seed:u=21}){const l=b(),a=o??(l>=2?260:l===1?140:60),i=c.useRef(),{pointer:d}=A(),y=C(),{geo:m,speeds:w,base:x}=c.useMemo(()=>{const s=D(u),r=new Float32Array(a*3),n=new Float32Array(a);for(let t=0;t<a;t++)r[t*3]=(s()-.5)*e,r[t*3+1]=(s()-.5)*e*.8,r[t*3+2]=(s()-.5)*e*.6,n[t]=.12+s()*.4;const f=new P;return f.setAttribute("position",new T(r,3)),{geo:f,speeds:n,base:r.slice()}},[a,e,u]),M=c.useMemo(()=>new S({size:.035,color:new h("#8fd6ff"),transparent:!0,opacity:.55,depthWrite:!1,blending:j,sizeAttenuation:!0}),[]);return g((s,r)=>{if(y)return;const n=m.attributes.position.array,f=e*.4;for(let t=0;t<a;t++)n[t*3+1]+=w[t]*r,n[t*3+1]>f&&(n[t*3+1]=-f),n[t*3]=x[t*3]+Math.sin(s.clock.elapsedTime*.3+t)*.18;m.attributes.position.needsUpdate=!0,i.current&&(i.current.rotation.y=v.lerp(i.current.rotation.y,d.x*.16,1-Math.pow(.01,r)),i.current.rotation.x=v.lerp(i.current.rotation.x,-d.y*.1,1-Math.pow(.01,r)))}),p.jsx("points",{ref:i,geometry:m,material:M,frustumCulled:!1})}function E({y:o=-3.2,size:e=46,cell:u=1.1,color:l="#56dcff"}){const a=c.useMemo(()=>new F({transparent:!0,depthWrite:!1,side:U,uniforms:{uColor:{value:new h(l)},uCell:{value:u},uTime:{value:0},uSize:{value:e}},vertexShader:`
          varying vec2 vUv;
          varying vec3 vPos;
          void main() {
            vUv = uv;
            vPos = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,fragmentShader:`
          varying vec2 vUv;
          varying vec3 vPos;
          uniform vec3 uColor;
          uniform float uCell;
          uniform float uTime;
          uniform float uSize;

          // Analytic anti-aliased grid: derivative-based line width keeps the
          // far side of the plane from aliasing into moire.
          float grid(vec2 p, float w) {
            vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);
            float line = min(g.x, g.y);
            return 1.0 - min(line * w, 1.0);
          }

          void main() {
            vec2 p = vPos.xy / uCell;
            float fine = grid(p, 1.0) * 0.5;
            float coarse = grid(p * 0.2, 1.3) * 0.85;
            float g = max(fine, coarse);

            float d = length(vPos.xy) / (uSize * 0.5);
            float fade = smoothstep(1.0, 0.15, d);

            // A slow scan sweep outward from the centre.
            float scan = 0.14 * smoothstep(0.06, 0.0, abs(fract(d * 1.6 - uTime * 0.08) - 0.5) - 0.44);

            float a = (g * fade * 0.55) + scan * fade;
            if (a < 0.002) discard;
            gl_FragColor = vec4(uColor, a);
          }
        `}),[u,l,e]);return g(i=>{a.uniforms.uTime.value=i.clock.elapsedTime}),p.jsx("mesh",{material:a,position:[0,o,0],rotation:[-Math.PI/2,0,0],frustumCulled:!1,children:p.jsx("planeGeometry",{args:[e,e]})})}export{z as D,E as G};
