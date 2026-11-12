// GLSL for the pond. Everything is drawn in code: water, floor, light, koi skin shading, lily pads.

const H = `#version 300 es
precision highp float;
`;

const NOISE = `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x), mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.03+vec2(17.1,9.2); a*=.5; } return s/.96875; }
float fbm3(vec2 p){ float s=0., a=.5; for(int i=0;i<3;i++){ s+=a*vnoise(p); p=p*2.03+vec2(17.1,9.2); a*=.5; } return s/.875; }
`;

export const FULLSCREEN_VS = H + `
out vec2 vUv;
void main(){
  vec2 p = vec2(gl_VertexID==1 ? 3. : -1., gl_VertexID==2 ? 3. : -1.);
  vUv = p*.5+.5;
  gl_Position = vec4(p,0.,1.);
}`;

/** Height-field ripples: r = height now, g = height last step. */
export const SIM_FS = H + `
in vec2 vUv; out vec4 o;
uniform sampler2D uState; uniform vec2 uTexel; uniform float uAspect;
uniform vec4 uDrops[16]; uniform int uDropCount;
void main(){
  vec4 s = texture(uState, vUv);
  float h = s.r, p = s.g;
  float n = texture(uState, vUv+vec2(0.,uTexel.y)).r, sd = texture(uState, vUv-vec2(0.,uTexel.y)).r;
  float e = texture(uState, vUv+vec2(uTexel.x,0.)).r, w = texture(uState, vUv-vec2(uTexel.x,0.)).r;
  float nh = (2.*h - p + .2*(n+sd+e+w-4.*h)) * .991;
  for(int i=0;i<16;i++){
    if(i>=uDropCount) break;
    vec4 d = uDrops[i]; vec2 dd = vUv-d.xy; dd.x *= uAspect; float r = length(dd);
    if(r<d.z) nh -= d.w*(.5+.5*cos(3.14159*r/d.z));
  }
  o = vec4(nh, h, 0., 1.);
}`;

/** Static pond floor: silt, pebbles, algae. Alpha = how deep the water is here. */
export const FLOOR_FS = H + NOISE + `
in vec2 vUv; out vec4 o;
uniform float uAspect;
vec3 pebbleLayer(vec2 p, vec3 col, float coverage, float sizeK, vec2 L, float salt){
  vec2 i=floor(p), f=fract(p);
  float best=9.; vec2 bv=vec2(0.); vec2 id=vec2(0.);
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
    vec2 g=vec2(x,y); vec2 h=hash22(i+g+salt);
    vec2 pt = g + .15 + .7*h - f;
    float d = length(pt*vec2(1., 1.+.5*h.x)) + .07*(vnoise((f+g)*5.+h*40.)-.5);
    if(d<best){ best=d; bv=pt; id=i+g; }
  }
  float rad = (.26 + .2*hash12(id+3.1+salt))*sizeK;
  float present = step(1.-coverage, hash12(id+9.7+salt));
  float peb = smoothstep(rad, rad-.05, best)*present;
  float ao = smoothstep(rad+.14, rad, best)*(1.-peb)*present;
  float pick = hash12(id+1.3+salt);
  vec3 pc = pick<.35 ? vec3(.38,.36,.31) : pick<.65 ? vec3(.36,.28,.2) : pick<.92 ? vec3(.22,.23,.21) : vec3(.55,.52,.46);
  pc *= .85 + .3*hash12(id+5.5+salt);
  float dome = sqrt(max(0., 1.-best/rad));
  float lit = .72 + .45*dot(-bv/rad, L)*dome + .15*dome;
  pc *= lit*(.88 + .24*fbm3((p+id)*4.));
  col *= 1. - .4*ao;
  return mix(col, pc, peb);
}
void main(){
  vec2 q = vUv*vec2(uAspect,1.);
  vec2 p = q*13.;
  vec2 L = normalize(vec2(-.6,.6));
  float m = fbm(p*.6);
  vec3 col = mix(vec3(.16,.15,.10), vec3(.29,.26,.18), m);
  col *= .9 + .2*vnoise(p*6.);
  col = pebbleLayer(p*2.1, col, .22, .85, L, 31.);
  col = pebbleLayer(p, col, .38, 1., L, 0.);
  float al = smoothstep(.42, .75, fbm(q*3.2+vec2(3.,7.)));
  col = mix(col, col*vec3(.7,1.,.55)+vec3(.0,.035,.0), al*.65);
  // a few drowned leaves
  vec2 lp = q*3.; vec2 li=floor(lp), lf=fract(lp)-.5; vec2 lh=hash22(li+71.);
  if(lh.x>.62){
    float a = lh.y*6.283; mat2 R = mat2(cos(a),-sin(a),sin(a),cos(a));
    vec2 r = R*(lf-(lh-.5)*.5); r.x*=1.;
    float leaf = smoothstep(0., .03, .13 - length(r*vec2(2.6,1.)));
    vec3 lc = mix(vec3(.36,.24,.12), vec3(.25,.18,.10), vnoise(r*20.));
    col = mix(col, lc, leaf*.85);
  }
  float depth = clamp(.5 + .7*(fbm3(q*1.2+11.)-.5), 0., 1.);
  o = vec4(col, depth);
}`;

export const KOI_VS = H + `
layout(location=0) in vec2 aPos; layout(location=1) in vec2 aUv;
layout(location=2) in vec4 aInfo; layout(location=3) in vec4 aFish; layout(location=4) in vec2 aExtra;
uniform vec2 uRes;
out vec2 vUv; out vec4 vInfo; out vec4 vFish; out vec2 vExtra;
void main(){
  vUv=aUv; vInfo=aInfo; vFish=aFish; vExtra=aExtra;
  vec2 c = aPos/uRes*2.-1.;
  gl_Position = vec4(c.x, -c.y, 0., 1.);
}`;

export const KOI_FS = H + NOISE + `
in vec2 vUv; in vec4 vInfo; in vec4 vFish; in vec2 vExtra; out vec4 o;
uniform sampler2D uAtlas; uniform float uRows; uniform vec3 uDeepTint; uniform float uTime;
void main(){
  float kind=vInfo.y, depth=vInfo.z, ls=vInfo.w;
  float u=vUv.x, v=vUv.y;
  vec3 col; float a;
  if(kind<.5){
    float bu = clamp(u/.84, 0., 1.);
    vec2 tc = vec2(bu, (vInfo.x + .03 + (v*.5+.5)*.94)/uRows);
    col = texture(uAtlas, tc).rgb;
    float nz = sqrt(max(0., 1.-v*v));
    // scales: offset rows, only behind the head
    vec2 sc = vec2(u*44., v*6.2); float row=floor(sc.y); sc.x += .5*mod(row,2.);
    vec2 f = fract(sc)-.5; float se = smoothstep(.25,.5,length(f*vec2(1.,1.2)));
    float scaleMask = smoothstep(.17,.23,u)*nz;
    col *= 1. - .09*se*scaleMask;
    float metal = vFish.w;
    float spark = hash12(floor(sc)+vec2(vExtra.y*91.,0.));
    col += metal*vec3(1.,.88,.55)*(.18*pow(nz,3.) + .25*step(.8,spark)*scaleMask*(.5+.5*sin(uTime*1.5+spark*20.)));
    // gill plate and dorsal fin
    float gill = exp(-pow((u-.165-.035*v*v)/.006, 2.))*smoothstep(1.,.3,abs(v));
    col *= 1.-.14*gill;
    float dor = exp(-pow(v/.07, 2.))*smoothstep(.3,.36,u)*smoothstep(.7,.6,u);
    col = mix(col, col*.8+.04, dor*.55);
    // eyes sit low on the sides of the head
    vec2 ed = vec2((u-.07)*9., abs(v)-.8); float eye = smoothstep(.15,.09,length(ed));
    col = mix(col, vec3(.05,.05,.06), eye*.8);
    // round body lighting + wet sheen along the spine
    float diff = .6 + .32*nz + .18*v*ls;
    col *= diff;
    col += .05*pow(nz, 20.);
    a = smoothstep(1., .8, abs(v));
  } else if(kind<1.5){
    float t = (u-.78)/.22;
    float edge = 1. - .3*(1.-abs(v));
    float shape = smoothstep(edge, edge-.07, t)*smoothstep(1., .85, abs(v));
    float rays = .82 + .18*sin(v*26. + t*1.5);
    col = vFish.rgb*rays;
    a = shape*(.38 + .3*(1.-t));
  } else {
    float t = u;
    float wf = (.42+.58*t)*sqrt(max(0., 1.-pow(t,5.)));
    float shape = smoothstep(wf, wf-.18, abs(v));
    float rays = .82 + .18*sin(v/(t+.25)*5.);
    col = vFish.rgb*rays;
    float moto = vExtra.x*smoothstep(.6,.2,t);
    col = mix(col, vec3(.05), moto);
    col *= .92 + .1*v*ls;
    a = shape*(.45 + .25*(1.-t) + moto*.25);
  }
  col = mix(col, uDeepTint, depth*.55);
  col *= 1. - depth*.22;
  o = vec4(col*a, a);
}`;

export const SURF_VS = H + `
layout(location=0) in vec2 aPos; layout(location=1) in vec2 aLocal; layout(location=2) in vec4 aParams;
uniform vec2 uRes;
out vec2 vLocal; out vec4 vParams;
void main(){
  vLocal=aLocal; vParams=aParams;
  vec2 c = aPos/uRes*2.-1.;
  gl_Position = vec4(c.x, -c.y, 0., 1.);
}`;

/** Lily pads and food pellets floating on the surface. */
export const SURF_FS = H + NOISE + `
in vec2 vLocal; in vec4 vParams; out vec4 o;
void main(){
  vec2 p = vLocal; float seed = vParams.y;
  float r = length(p);
  if(vParams.x<.5){
    float ang = atan(p.y, p.x);
    float R = .96 - .03*vnoise(vec2(cos(ang),sin(ang))*2.5 + seed*7.);
    float slit = smoothstep(.03+.05*r, .015+.04*r, abs(ang))*step(0.,p.x)*smoothstep(.0,.05,r);
    float a = smoothstep(R, R-.025, r)*(1.-slit);
    float mm = fbm(p*2.5+seed*13.);
    vec3 c = mix(vec3(.15,.24,.10), vec3(.29,.37,.15), mm);
    float va = ang + .3*sin(r*4.+seed*3.) + .15*vnoise(p*3.+seed);
    float vein = pow(abs(cos(va*8.)), 70.)*smoothstep(.1,.35,r)*smoothstep(R,R-.2,r);
    c += vein*vec3(.025,.03,.01);
    float age = fract(seed*7.31);
    float dry = smoothstep(R-.22, R, r)*smoothstep(.5,.72, fbm(p*5.+seed*3.))*age;
    c = mix(c, vec3(.44,.34,.15), dry*.85);
    c = mix(c, c*vec3(1.1,1.,.6), smoothstep(.62,.8,fbm(p*7.+seed*5.))*.35);
    float rim = smoothstep(R-.07, R-.015, r);
    c = mix(c, c*1.28+.025, rim*.55);
    c *= .9 + .16*dot(p, normalize(vec2(-.6,-.6)));
    c *= .92 + .14*smoothstep(.0,.25,r);
    o = vec4(c*a, a);
  } else {
    float a = smoothstep(1., .75, r);
    vec3 c = vec3(.42,.27,.13)*(.75 + .5*smoothstep(1.,0.,length(p-vec2(-.35,-.35))));
    o = vec4(c*a, a);
  }
}`;

export const COMPOSITE_FS = H + NOISE + `
in vec2 vUv; out vec4 o;
uniform sampler2D uRipple, uKoi, uSurf, uFloor;
uniform vec2 uSimTexel; uniform float uTime, uAspect, uNight, uShadowLen;
uniform vec3 uSun, uAmb, uSky, uDeep, uLight;
uniform vec2 uBlur;
uniform float uSandOn, uRevR; uniform vec2 uRevC;

float caustic(vec2 p, float t){
  vec2 i=floor(p), f=fract(p);
  float d1=8., d2=8.;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
    vec2 g=vec2(x,y); vec2 h=hash22(i+g);
    vec2 pt = g + .5 + .4*sin(t*(.6+h) + 6.2831*h) - f;
    float d = dot(pt,pt);
    if(d<d1){ d2=d1; d1=d; } else if(d<d2){ d2=d; }
  }
  float e = sqrt(d2)-sqrt(d1);
  return pow(1.-smoothstep(0., .2, e), 4.);
}

void main(){
  vec2 uv = vUv;
  vec2 e = uSimTexel;
  float hL=texture(uRipple,uv-vec2(e.x,0.)).r, hR=texture(uRipple,uv+vec2(e.x,0.)).r;
  float hD=texture(uRipple,uv-vec2(0.,e.y)).r, hU=texture(uRipple,uv+vec2(0.,e.y)).r;
  vec2 g = vec2(hR-hL, hU-hD)*.8;
  vec2 wp = uv*vec2(uAspect,1.)*16.;
  g += .02*vec2(cos(wp.x+uTime*1.3+sin(wp.y*.7)), cos(wp.y*1.13-uTime*1.1+sin(wp.x*.6)));
  g += .03*(vec2(vnoise(wp*1.7+uTime*.4), vnoise(wp*1.7+vec2(5.2,1.3)-uTime*.35))-.5);
  vec3 n = normalize(vec3(-g, 1.));
  vec2 asp = vec2(1./uAspect, 1.);
  vec2 refr = n.xy*asp*.02;

  vec4 surf = texture(uSurf, uv + n.xy*asp*.002);
  vec2 so = -uLight.xy/max(uLight.z,.3)*uShadowLen*asp;

  // floor seen through the water
  vec2 fuv = uv + refr*1.4;
  vec4 fl = texture(uFloor, fuv);
  vec2 cp = fuv*vec2(uAspect,1.)*8.;
  vec2 cw = cp + .9*vec2(fbm3(cp*.35+uTime*.05), fbm3(cp*.35+vec2(4.,1.)-uTime*.05)) + n.xy*.8;
  float c1 = caustic(cw, uTime*.5), c2 = caustic(cw*1.37+vec2(2.3,5.1), uTime*.61);
  float c = (c1*c2*2.2 + .18*(c1+c2))*(1.-uNight);
  float fs=0., ps=0.;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
    vec2 off = vec2(x,y)*uBlur;
    fs += texture(uKoi, fuv+so+off).a;
    ps += texture(uSurf, fuv+so*1.7+off*1.6).a;
  }
  fs/=9.; ps/=9.;
  float lightAmt = (1.-fs*.6)*(1.-ps*.75);
  vec3 floorLit = fl.rgb*(uAmb + uSun*lightAmt*(.5 + 1.5*c*lightAmt));
  float fd = .42 + .4*fl.a;
  vec3 water = mix(floorLit, uDeep, fd);

  // koi, refracted a little less than the floor (they are higher in the water)
  vec4 k = texture(uKoi, uv + refr*.55);
  float padOnFish = texture(uSurf, uv+so*.6).a;
  float cf = caustic(cw*1.15+7.3, uTime*.5)*(1.-uNight);
  vec3 fishLit = k.rgb*(uAmb*1.25 + uSun*(.85 + .3*cf)*(1.-padOnFish*.6));
  vec3 col = water*(1.-k.a) + fishLit;

  // surface: sky + canopy reflection, sun glints
  float canopy = smoothstep(.42,.72, fbm3(uv*vec2(uAspect,1.)*2.2 + vec2(uTime*.006,0.) + n.xy*3.));
  vec3 skyR = uSky*.75*(1.-.8*canopy);
  float refl = .06 + clamp(length(g)*.8, 0., .2);
  col = mix(col, skyR, refl);
  vec3 Lf = normalize(vec3(uLight.xy*.5, 1.));
  vec3 Hh = normalize(Lf + vec3(0,0,1));
  float nh = max(dot(n,Hh),0.);
  col += uSun*(pow(nh, 900.)*1.6 + pow(nh, 120.)*.06)*(1.-canopy*.8)*(1.-uNight*.6);

  // lily pads and pellets on top
  vec3 surfLit = surf.rgb*(uAmb*1.1 + uSun*.95);
  col = col*(1.-surf.a) + surfLit;

  // silt and sand over the parts of the pond that are not dredged yet
  if(uSandOn>.5){
    vec2 ap = vec2(uv.x*uAspect, uv.y);
    float d = length(ap-uRevC);
    float sd = d + (fbm3(ap*5.)-.5)*.14 + (vnoise(ap*22.)-.5)*.03 - uRevR;
    float sand = smoothstep(-.004, .004, sd);
    float dune = fbm(ap*2.6);
    float ripl = sin((ap.x*1.2 + ap.y*.8)*48. + fbm3(ap*4.)*9.)*.5+.5;
    vec3 sc = mix(vec3(.58,.5,.37), vec3(.76,.67,.51), dune);
    sc *= .92 + .08*ripl;
    sc *= .94 + .12*vnoise(ap*85.);
    sc *= mix(1., .84, smoothstep(.55,.8,fbm3(ap*1.4+5.)));
    vec2 pi = floor(ap*28.); vec2 pf = fract(ap*28.)-.5; float ph = hash12(pi+3.);
    float peb = step(.965, ph)*smoothstep(.2,.1,length((pf-(hash22(pi)-.5)*.4)*vec2(1.,1.4)));
    sc = mix(sc, sc*vec3(.8,.78,.76), peb*.6);
    float wet = 1.-smoothstep(0., .08, sd);
    sc = mix(sc, sc*vec3(.55,.55,.5), wet*.75);
    float shade = .86 + .28*dune;
    vec3 sandLit = sc*shade*(uAmb*1.25 + uSun*.85);
    float foam = smoothstep(.013, .0, abs(sd+.007))*(.55+.45*vnoise(ap*38.+uTime*.7))*step(.001,uRevR);
    col = mix(col, sandLit, sand);
    col += vec3(.92,.94,.9)*foam*.32*(1.-uNight*.6);
  }
  // fireflies
  if(uNight>.01){
    for(int i=0;i<12;i++){
      float fi=float(i); vec2 h = hash22(vec2(fi,fi*1.7)+4.);
      vec2 pos = h + .06*vec2(sin(uTime*.3*(.5+h.x)+fi), cos(uTime*.25*(.5+h.y)+fi*2.));
      vec2 d = (uv-pos)*vec2(uAspect,1.);
      float r2 = dot(d,d);
      float blink = smoothstep(.55,1., sin(uTime*(.5+h.y)+fi*7.));
      col += vec3(.85,.95,.45)*(exp(-r2/.00002)*1.2 + exp(-r2/.0006)*.18)*blink*uNight;
    }
  }
  vec2 q = uv-.5;
  col *= 1. - .55*dot(q*vec2(1.,1.2),q*vec2(1.,1.2));
  col += (hash12(gl_FragCoord.xy + fract(uTime*7.)*100.)-.5)*.018;
  o = vec4(pow(max(col,0.), vec3(.95)), 1.);
}`;
