// Рендер: тонмаппинг, небо HDRI, солнце, постобработка (AO, bloom, грейдинг, зерно).
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { A } from './assets.js';

export function createRenderer(container, quality) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
  const dpr = Math.min(window.devicePixelRatio || 1, quality === 'high' ? 1.5 : quality === 'mid' ? 1.25 : 1);
  renderer.setPixelRatio(dpr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  return renderer;
}

export function setupScene(scene, renderer, quality) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(A.hdr).texture;
  scene.environment = env;
  scene.background = A.hdr;
  scene.backgroundIntensity = 0.72;
  scene.environmentIntensity = 0.75;
  scene.backgroundBlurriness = 0.0;
  // туман цвета горизонта панорамы
  scene.fog = new THREE.FogExp2(new THREE.Color(0x8c8f84), 0.0062);
  const sun = new THREE.DirectionalLight(0xffe4c0, 2.4);
  sun.castShadow = true;
  const sz = quality === 'high' ? 4096 : 2048;
  sun.shadow.mapSize.set(sz, sz);
  const c = sun.shadow.camera; c.left = -60; c.right = 60; c.top = 60; c.bottom = -60; c.near = 1; c.far = 260;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3;
  scene.add(sun); scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xb8bcae, 0x3e3a30, 0.35); scene.add(hemi);
  return { sun, hemi, sunDir: new THREE.Vector3(-0.45, 0.72, 0.53).normalize() };
}

// Цветокор «Зоны»: приглушённые цвета, зеленовато-жёлтый оттенок, виньетка, зерно, лёгкая хроматика
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uHurt: { value: 0 }, uRad: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uHurt, uRad; uniform vec2 uRes; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv; vec2 d = uv - 0.5;
      float ca = 0.0012 + uHurt * 0.006 + uRad * 0.002;
      vec3 c;
      c.r = texture2D(tDiffuse, uv + d * ca).r;
      c.g = texture2D(tDiffuse, uv).g;
      c.b = texture2D(tDiffuse, uv - d * ca).b;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, 0.78);                       // приглушённая насыщенность
      c *= vec3(1.02, 1.0, 0.9);                        // тёплый жёлто-зелёный оттенок
      c = (c - 0.5) * 1.08 + 0.5;                       // контраст
      c = mix(c, c * vec3(0.8, 1.15, 0.6), uRad * 0.5); // радиация
      c = mix(c, c * vec3(1.4, 0.5, 0.45), uHurt * 0.6);
      float vig = smoothstep(0.85, 0.25, length(d * vec2(1.1, 1.0)));
      c *= mix(0.55, 1.0, vig);
      c += (hash(uv * uRes + uTime) - 0.5) * (0.035 + uRad * 0.05);
      gl_FragColor = vec4(c, 1.0);
    }`
};

export function createComposer(renderer, scene, camera, quality) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  let gtao = null;
  if (quality === 'high') {
    gtao = new GTAOPass(scene, camera, window.innerWidth, window.innerHeight);
    gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1.0, scale: 1.0, samples: 12 });
    gtao.blendIntensity = 0.85;
    composer.addPass(gtao);
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.22, 0.6, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  if (quality !== 'low') composer.addPass(new SMAAPass(window.innerWidth * renderer.getPixelRatio(), window.innerHeight * renderer.getPixelRatio()));
  const resize = () => {
    composer.setSize(window.innerWidth, window.innerHeight);
    grade.uniforms.uRes.value.set(window.innerWidth, window.innerHeight);
  };
  resize();
  return { composer, grade, bloom, gtao, resize };
}
