// Small WebGL renderer: per-vertex colour, one sun light, hemisphere ambient, distance fog,
// per-mesh frustum culling. GLSL 100 so it runs on WebGL2 or WebGL1.
import { frustumPlanes, sphereInFrustum } from './math.js';
import { meshBoundingSphere } from './scene-data.js';

const VS = `
attribute vec3 aPosition;
attribute vec3 aNormal;
attribute vec3 aColor;
uniform mat4 uViewProj;
uniform vec3 uEye;
varying vec3 vNormal;
varying vec3 vColor;
varying float vDist;
void main() {
  vNormal = aNormal;
  vColor = aColor;
  vDist = distance(aPosition, uEye);
  gl_Position = uViewProj * vec4(aPosition, 1.0);
}`;

const FS = `
precision mediump float;
uniform vec3 uSunDir;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uOpacity;
varying vec3 vNormal;
varying vec3 vColor;
varying float vDist;
void main() {
  vec3 n = normalize(vNormal);
  float sun = max(dot(n, uSunDir), 0.0);
  float sky = 0.5 + 0.5 * n.y;
  vec3 ambient = mix(vec3(0.32, 0.30, 0.26), vec3(0.55, 0.60, 0.70), sky);
  vec3 c = vColor * (ambient + vec3(0.75, 0.72, 0.62) * sun);
  float fog = 1.0 - exp(-uFogDensity * vDist);
  gl_FragColor = vec4(mix(c, uFogColor, clamp(fog, 0.0, 1.0)), uOpacity);
}`;

export const SKY_COLOR = [0.72, 0.82, 0.92];

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error('Shader compile failed: ' + gl.getShaderInfoLog(sh));
  }
  return sh;
}

/** Order meshes (with .sphere) by decreasing distance from the eye, for alpha blending. */
export function sortFarToNear(meshes, eye) {
  const d2 = (m) => {
    const c = m.sphere.centre;
    return (c[0] - eye[0]) ** 2 + (c[1] - eye[1]) ** 2 + (c[2] - eye[2]) ** 2;
  };
  return meshes.map((m) => [d2(m), m]).sort((a, b) => b[0] - a[0]).map(([, m]) => m);
}

export class Renderer {
  constructor(canvas) {
    const opts = { antialias: true, powerPreference: 'high-performance' };
    const gl = canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts);
    if (!gl) throw new Error('WebGL is not available in this browser.');
    this.gl = gl;
    this.isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
    this.uintIndices = this.isWebGL2 || !!gl.getExtension('OES_element_index_uint');
    this.canvas = canvas;
    this.meshes = [];
    this.fogDensity = 0.0025;

    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('Shader link failed: ' + gl.getProgramInfoLog(prog));
    }
    this.prog = prog;
    this.loc = {
      aPosition: gl.getAttribLocation(prog, 'aPosition'),
      aNormal: gl.getAttribLocation(prog, 'aNormal'),
      aColor: gl.getAttribLocation(prog, 'aColor'),
      uViewProj: gl.getUniformLocation(prog, 'uViewProj'),
      uEye: gl.getUniformLocation(prog, 'uEye'),
      uSunDir: gl.getUniformLocation(prog, 'uSunDir'),
      uFogColor: gl.getUniformLocation(prog, 'uFogColor'),
      uFogDensity: gl.getUniformLocation(prog, 'uFogDensity'),
      uOpacity: gl.getUniformLocation(prog, 'uOpacity'),
    };
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
  }

  /** Upload normalized meshes (see scene-data.js). */
  upload(meshes) {
    const gl = this.gl;
    for (const m of meshes) {
      let indices = m.indices;
      if (indices instanceof Uint32Array && !this.uintIndices) {
        throw new Error(`Mesh "${m.name}" needs 32-bit indices, unsupported by this GPU.`);
      }
      const buf = (target, data) => {
        const b = gl.createBuffer();
        gl.bindBuffer(target, b);
        gl.bufferData(target, data, gl.STATIC_DRAW);
        return b;
      };
      this.meshes.push({
        name: m.name,
        position: buf(gl.ARRAY_BUFFER, m.positions),
        normal: buf(gl.ARRAY_BUFFER, m.normals),
        color: buf(gl.ARRAY_BUFFER, m.colors),
        index: buf(gl.ELEMENT_ARRAY_BUFFER, indices),
        count: indices.length,
        indexType: indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
        sphere: meshBoundingSphere(m.positions),
        doubleSided: !!m.doubleSided,
        opacity: m.opacity ?? 1,
      });
    }
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(this.canvas.clientWidth * dpr);
    const h = Math.round(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    return w / Math.max(h, 1);
  }

  /** Draw all visible meshes; returns { drawCalls, triangles } for the stats overlay. */
  render(viewProj, eye) {
    const gl = this.gl;
    const L = this.loc;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(SKY_COLOR[0], SKY_COLOR[1], SKY_COLOR[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(L.uViewProj, false, viewProj);
    gl.uniform3fv(L.uEye, eye);
    const sun = [0.45, 0.8, 0.35];
    const sl = Math.hypot(...sun);
    gl.uniform3f(L.uSunDir, sun[0] / sl, sun[1] / sl, sun[2] / sl);
    gl.uniform3fv(L.uFogColor, SKY_COLOR);
    gl.uniform1f(L.uFogDensity, this.fogDensity);

    const planes = frustumPlanes(viewProj);
    let drawCalls = 0, triangles = 0;
    const attrib = (loc, buffer) => {
      if (loc < 0) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
    };
    const draw = (m) => {
      attrib(L.aPosition, m.position);
      attrib(L.aNormal, m.normal);
      attrib(L.aColor, m.color);
      gl.uniform1f(L.uOpacity, m.opacity);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.index);
      if (m.doubleSided) gl.disable(gl.CULL_FACE);
      gl.drawElements(gl.TRIANGLES, m.count, m.indexType, 0);
      if (m.doubleSided) gl.enable(gl.CULL_FACE);
      drawCalls++;
      triangles += m.count / 3;
    };
    const visible = this.meshes.filter((m) => sphereInFrustum(planes, m.sphere.centre, m.sphere.radius));
    for (const m of visible) if (m.opacity >= 1) draw(m);
    // Translucent meshes last, far to near, depth-tested but not depth-writing.
    const translucent = sortFarToNear(visible.filter((m) => m.opacity < 1), eye);
    if (translucent.length) {
      gl.enable(gl.BLEND);
      gl.depthMask(false);
      for (const m of translucent) draw(m);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }
    return { drawCalls, triangles };
  }
}
