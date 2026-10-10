// Minimal WebGL 1 renderer: vertex-colored meshes, hemisphere + sun lighting,
// animated water shading and distance fog. No external dependencies.

import { multiply, normalize, perspective } from './math.js';

const VERTEX_SHADER = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec3 aColor;
uniform mat4 uViewProj;
varying vec3 vNormal;
varying vec3 vColor;
varying vec3 vWorld;
void main() {
  vNormal = aNormal;
  vColor = aColor;
  vWorld = aPosition;
  gl_Position = uViewProj * vec4(aPosition, 1.0);
}`;

const FRAGMENT_SHADER = `
precision highp float;
varying vec3 vNormal;
varying vec3 vColor;
varying vec3 vWorld;
uniform vec3 uEye;
uniform vec3 uSunDir;
uniform vec3 uSkyColor;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uWater;
uniform float uTime;
uniform vec3 uAmbientGround;
uniform vec3 uAmbientSky;
uniform float uEmissive;
void main() {
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  vec3 color = vColor;
  if (uWater > 0.5) {
    // Procedural ripples perturb the normal of flat water.
    float r1 = sin(vWorld.x * 0.9 + uTime * 1.3) + sin(vWorld.z * 1.1 - uTime * 1.1);
    float r2 = sin((vWorld.x + vWorld.z) * 2.3 + uTime * 2.0);
    n = normalize(n + vec3(r1 * 0.035 + r2 * 0.015, 0.0, r1 * 0.03 - r2 * 0.015));
  }
  vec3 viewDir = normalize(uEye - vWorld);
  float sun = max(dot(n, uSunDir), 0.0);
  vec3 hemi = mix(uAmbientGround, uAmbientSky, n.y * 0.5 + 0.5);
  vec3 lit = color * (hemi * 0.62 + vec3(1.0, 0.95, 0.85) * sun * 0.72 + vec3(1.0, 0.9, 0.7) * uEmissive);
  if (uWater > 0.5) {
    float fresnel = pow(1.0 - max(dot(viewDir, n), 0.0), 3.0);
    lit = mix(lit, uSkyColor, clamp(fresnel * 0.8, 0.0, 0.8));
    vec3 h = normalize(uSunDir + viewDir);
    lit += vec3(1.0, 0.95, 0.8) * pow(max(dot(n, h), 0.0), 120.0) * 0.8;
  }
  float dist = length(uEye - vWorld);
  float fog = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
  gl_FragColor = vec4(mix(lit, uFogColor, clamp(fog, 0.0, 1.0)), 1.0);
}`;

const SKY_VERTEX = `
attribute vec2 aPos;
varying float vY;
void main() { vY = aPos.y; gl_Position = vec4(aPos, 0.9999, 1.0); }`;

const SKY_FRAGMENT = `
precision mediump float;
varying float vY;
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform float uHorizonY;
void main() {
  float t = clamp((vY - uHorizonY) * 1.2, 0.0, 1.0);
  gl_FragColor = vec4(mix(uHorizon, uTop, sqrt(t)), 1.0);
}`;

export const SKY_TOP = [0.38, 0.58, 0.85];
export const FOG_COLOR = [0.76, 0.83, 0.9];
export const SUN_DIR = normalize([-0.45, 0.75, 0.35]);
export const FOG_DISTANCE = 900; // meters; fog factor = 1 - exp(-(d / FOG_DISTANCE)^2)
// Hemisphere ambient: color from below (ground bounce) and above (sky).
export const AMBIENT_GROUND = [0.46, 0.42, 0.35];
export const AMBIENT_SKY = [0.62, 0.7, 0.82];
// Extra light for 'lamplit' surfaces (the arcade ceiling).
export const LAMPLIT_EMISSIVE = 0.5;
export const FOV_Y = (55 * Math.PI) / 180;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`Program link failed: ${gl.getProgramInfoLog(p)}`);
  return p;
}

export class Renderer {
  constructor(canvas) {
    const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
    if (!gl) throw new Error('WebGL is not available in this browser.');
    this.gl = gl;
    this.canvas = canvas;
    this.meshes = [];
    this.prog = program(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    this.loc = {
      aPosition: gl.getAttribLocation(this.prog, 'aPosition'),
      aNormal: gl.getAttribLocation(this.prog, 'aNormal'),
      aColor: gl.getAttribLocation(this.prog, 'aColor'),
    };
    this.uni = {};
    for (const n of ['uViewProj', 'uEye', 'uSunDir', 'uSkyColor', 'uFogColor', 'uFogDensity', 'uWater', 'uTime', 'uAmbientGround', 'uAmbientSky', 'uEmissive']) {
      this.uni[n] = gl.getUniformLocation(this.prog, n);
    }
    this.skyProg = program(gl, SKY_VERTEX, SKY_FRAGMENT);
    this.skyBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
  }

  upload(component) {
    const gl = this.gl;
    const buf = (data) => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return b;
    };
    this.meshes.push({
      name: component.name,
      water: component.material === 'water',
      emissive: component.material === 'lamplit' ? LAMPLIT_EMISSIVE : 0,
      count: component.vertexCount,
      position: buf(component.positions),
      normal: buf(component.normals),
      color: buf(component.colors),
      visible: true,
    });
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(this.canvas.clientWidth * dpr);
    const h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  render(camera, time) {
    const gl = this.gl;
    this.resize();
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(FOG_COLOR[0], FOG_COLOR[1], FOG_COLOR[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    const proj = perspective(FOV_Y, aspect, 0.25, 2500);
    const view = camera.viewMatrix();
    const viewProj = multiply(proj, view);

    // Sky gradient behind everything; horizon follows camera pitch.
    const eye = camera.eye();
    const tgt = camera.target();
    const dir = normalize([tgt[0] - eye[0], tgt[1] - eye[1], tgt[2] - eye[2]]);
    const pitch = Math.asin(Math.max(-1, Math.min(1, dir[1])));
    const horizonY = -Math.tan(pitch) / Math.tan(FOV_Y / 2);
    gl.depthMask(false);
    gl.useProgram(this.skyProg);
    gl.uniform3fv(gl.getUniformLocation(this.skyProg, 'uTop'), SKY_TOP);
    gl.uniform3fv(gl.getUniformLocation(this.skyProg, 'uHorizon'), FOG_COLOR);
    gl.uniform1f(gl.getUniformLocation(this.skyProg, 'uHorizonY'), horizonY);
    const aPos = gl.getAttribLocation(this.skyProg, 'aPos');
    gl.bindBuffer(gl.ARRAY_BUFFER, this.skyBuf);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(aPos);
    gl.depthMask(true);

    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.uni.uViewProj, false, viewProj);
    gl.uniform3fv(this.uni.uEye, eye);
    gl.uniform3fv(this.uni.uSunDir, SUN_DIR);
    gl.uniform3fv(this.uni.uSkyColor, SKY_TOP);
    gl.uniform3fv(this.uni.uFogColor, FOG_COLOR);
    gl.uniform1f(this.uni.uFogDensity, 1 / FOG_DISTANCE);
    gl.uniform3fv(this.uni.uAmbientGround, AMBIENT_GROUND);
    gl.uniform3fv(this.uni.uAmbientSky, AMBIENT_SKY);
    gl.uniform1f(this.uni.uTime, time);
    for (const loc of Object.values(this.loc)) gl.enableVertexAttribArray(loc);
    let drawn = 0;
    for (const m of this.meshes) {
      if (!m.visible) continue;
      gl.uniform1f(this.uni.uWater, m.water ? 1 : 0);
      gl.uniform1f(this.uni.uEmissive, m.emissive);
      gl.bindBuffer(gl.ARRAY_BUFFER, m.position);
      gl.vertexAttribPointer(this.loc.aPosition, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, m.normal);
      gl.vertexAttribPointer(this.loc.aNormal, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, m.color);
      gl.vertexAttribPointer(this.loc.aColor, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, m.count);
      drawn += m.count / 3;
    }
    return drawn;
  }
}
