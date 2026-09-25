// Rising hold water: WebGL surface + caustics. Shared with ranswake.vercel.app (site/water.js).
// References: Evan Wallace (madebyevan.com/webgl-water) for caustic intensity,
// Maxime Heckel / GPU Gems for domain-warped sine caustics, Gerstner-style surface.
// Rise is a clip height — never scaleY, which smears the meniscus.
(function () {
  "use strict";

  var wrap = document.getElementById("water");
  if (!wrap) return;

  var teleWater = document.getElementById("tele-water");
  var floodM = document.getElementById("flood-tele-m");
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var rise = 0.35;

  function pageProgress() {
    var doc = document.documentElement;
    var max = Math.max(1, doc.scrollHeight - window.innerHeight);
    return Math.min(1, Math.max(0, window.scrollY / max));
  }

  function setRise() {
    var t = reduce ? 0 : pageProgress();
    rise = 0.14 + t * 0.34;   // capped: on the downloads page the water stays behind the install steps
    wrap.style.setProperty("--fill", (rise * 100).toFixed(1) + "%");
    var meters = (0.12 + t * 2.28).toFixed(2) + "m";
    if (teleWater) teleWater.textContent = meters;
    if (floodM) floodM.textContent = meters;
  }
  setRise();
  window.addEventListener("scroll", setRise, { passive: true });
  window.addEventListener("resize", setRise);

  var canvas = document.createElement("canvas");
  canvas.id = "water-canvas";
  wrap.appendChild(canvas);

  var gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: false });
  if (!gl) {
    wrap.classList.add("is-fallback");
    return;
  }

  function compile(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn("water shader", gl.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  }

  var vs = compile(gl.VERTEX_SHADER, [
    "attribute vec2 a_pos;",
    "varying vec2 v_uv;",
    "void main(){",
    "  v_uv = a_pos * 0.5 + 0.5;",
    "  gl_Position = vec4(a_pos, 0.0, 1.0);",
    "}"
  ].join("\n"));

  var fs = compile(gl.FRAGMENT_SHADER, [
    "precision mediump float;",
    "varying vec2 v_uv;",
    "uniform vec2 u_res;",
    "uniform float u_time;",
    "uniform float u_rise;",
    "uniform float u_still;",
    "",
    "vec3 deep = vec3(0.059, 0.294, 0.361);",
    "vec3 mid  = vec3(0.184, 0.706, 0.839);",
    "vec3 high = vec3(0.494, 0.894, 1.000);",
    "vec3 ink  = vec3(0.020, 0.043, 0.063);",
    "",
    "float hash(vec2 p){",
    "  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);",
    "}",
    "float noise(vec2 p){",
    "  vec2 i = floor(p); vec2 f = fract(p);",
    "  float a = hash(i);",
    "  float b = hash(i + vec2(1.0, 0.0));",
    "  float c = hash(i + vec2(0.0, 1.0));",
    "  float d = hash(i + vec2(1.0, 1.0));",
    "  vec2 u = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);",
    "}",
    "float fbm(vec2 p){",
    "  float v = 0.0; float a = 0.5;",
    "  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }",
    "  return v;",
    "}",
    "",
    "float surface(float x, float t){",
    "  float w = 0.0;",
    "  w += 0.010 * sin(x * 21.0 + t * 0.75);",
    "  w += 0.006 * sin(x * 37.0 - t * 1.15);",
    "  w += 0.003 * sin(x * 63.0 + t * 0.45 + 1.7);",
    "  w += 0.002 * sin(x * 9.0  + t * 0.22);",
    "  return w;",
    "}",
    "",
    "float caustic(vec2 p, float t){",
    "  vec2 q = p;",
    "  q += 0.22 * vec2(sin(p.y * 3.8 + t * 0.31), sin(p.x * 4.4 - t * 0.27));",
    "  q += 0.14 * vec2(sin(p.y * 7.1 - t * 0.19), cos(p.x * 6.3 + t * 0.21));",
    "  float a = sin(q.x * 6.4) * sin(q.y * 7.2);",
    "  float b = sin(q.x * 9.1 + 1.8) * sin(q.y * 5.3 - 0.6);",
    "  float c = pow(0.5 + 0.5 * a, 9.0) + pow(0.5 + 0.5 * b, 11.0);",
    "  return c;",
    "}",
    "",
    "void main(){",
    "  vec2 uv = v_uv;",
    "  float aspect = u_res.x / max(u_res.y, 1.0);",
    "  float t = mix(u_time, 8.0, u_still);",
    "  float x = uv.x * aspect;",
    "  float surf = u_rise + surface(x, t);",
    "  float depth = surf - uv.y;",
    "  if (depth < -0.004) { gl_FragColor = vec4(0.0); return; }",
    "",
    "  float px = 1.5 / max(u_res.y, 1.0);",
    "  float foam = 1.0 - smoothstep(0.0, 0.018 + px * 10.0, abs(depth));",
    "  float crest = 1.0 - smoothstep(0.0, 0.005, abs(depth));",
    "",
    "  vec3 col = mix(mid, deep, smoothstep(0.0, 0.42, depth));",
    "  col = mix(col, ink, smoothstep(0.38, 0.95, depth));",
    "",
    "  vec2 cuv = vec2(x, uv.y) * vec2(2.8, 4.6);",
    "  float cau = caustic(cuv, t) * (0.55 + 0.45 * fbm(cuv * 0.7 + t * 0.03));",
    "  cau *= mix(1.0, 0.25, smoothstep(0.05, 0.7, depth));",
    "  col += high * cau * 0.16;",
    "",
    "  float fresnel = exp(-max(depth, 0.0) * 18.0);",
    "  col += mid * fresnel * 0.28;",
    "  col += high * crest * 0.55;",
    "  col += high * foam * 0.18;",
    "",
    "  float alpha = mix(0.18, 0.62, smoothstep(0.0, 0.65, depth));",
    "  alpha += foam * 0.28;",
    "  alpha = clamp(alpha, 0.0, 0.78);",
    "  gl_FragColor = vec4(col, alpha);",
    "}"
  ].join("\n"));

  if (!vs || !fs) {
    wrap.classList.add("is-fallback");
    return;
  }

  var prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    wrap.classList.add("is-fallback");
    return;
  }
  gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var loc = gl.getAttribLocation(prog, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  var uRes = gl.getUniformLocation(prog, "u_res");
  var uTime = gl.getUniformLocation(prog, "u_time");
  var uRise = gl.getUniformLocation(prog, "u_rise");
  var uStill = gl.getUniformLocation(prog, "u_still");

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.floor(wrap.clientWidth * dpr));
    var h = Math.max(1, Math.floor(wrap.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }

  var start = performance.now();

  function frame(now) {
    resize();
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, (now - start) / 1000);
    gl.uniform1f(uRise, rise);
    gl.uniform1f(uStill, reduce ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!reduce && !document.hidden) requestAnimationFrame(frame);
  }

  resize();
  requestAnimationFrame(frame);
  if (reduce) return;
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) requestAnimationFrame(frame);
  });
  window.addEventListener("resize", function () {
    resize();
    if (reduce) requestAnimationFrame(frame);
  });
})();
