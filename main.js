const canvas = document.querySelector("#scene");
const status = document.querySelector("#status");
const resetButton = document.querySelector("#reset-settings");

const DPR_LIMIT = 2;
const NOISE_SIZE = 256;
const SETTINGS_KEY = "fractured-orb-admin-settings";
const CHANNEL_RESOLUTION = new Float32Array([NOISE_SIZE, NOISE_SIZE, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

const DEFAULT_SETTINGS = Object.freeze({
  wobble: false,
  darkMode: false,
  maxDisperse: 3,
  maxBounce: 4,
  focusPoint: 0.65,
  focusScale: 1.0,
  maxBlurSize: 10.0,
  gradeGamma: 1.25,
  gradeBoost: 2.5,
  toneExposure: 16.0,
  animationSpeed: 1.0,
});

const SETTING_META = {
  wobble: { type: "boolean" },
  darkMode: { type: "boolean" },
  maxDisperse: { type: "number", min: 1, max: 5, step: 1 },
  maxBounce: { type: "number", min: 1, max: 10, step: 1 },
  focusPoint: { type: "number", min: 0.2, max: 2.0, step: 0.01 },
  focusScale: { type: "number", min: 0.1, max: 3.0, step: 0.01 },
  maxBlurSize: { type: "number", min: 1.0, max: 20.0, step: 0.1 },
  gradeGamma: { type: "number", min: 0.6, max: 2.2, step: 0.01 },
  gradeBoost: { type: "number", min: 0.5, max: 4.0, step: 0.01 },
  toneExposure: { type: "number", min: 4.0, max: 32.0, step: 0.1 },
  animationSpeed: { type: "number", min: 0.1, max: 2.5, step: 0.01 },
};

const settings = loadSettings();
const controls = {
  wobble: document.querySelector("#setting-wobble"),
  darkMode: document.querySelector("#setting-dark-mode"),
  maxDisperse: document.querySelector("#setting-dispersion"),
  maxBounce: document.querySelector("#setting-bounces"),
  focusPoint: document.querySelector("#setting-focus-point"),
  focusScale: document.querySelector("#setting-focus-scale"),
  maxBlurSize: document.querySelector("#setting-blur"),
  gradeGamma: document.querySelector("#setting-gamma"),
  gradeBoost: document.querySelector("#setting-boost"),
  toneExposure: document.querySelector("#setting-exposure"),
  animationSpeed: document.querySelector("#setting-speed"),
};

const outputs = {
  maxDisperse: document.querySelector("#setting-dispersion-value"),
  maxBounce: document.querySelector("#setting-bounces-value"),
  focusPoint: document.querySelector("#setting-focus-point-value"),
  focusScale: document.querySelector("#setting-focus-scale-value"),
  maxBlurSize: document.querySelector("#setting-blur-value"),
  gradeGamma: document.querySelector("#setting-gamma-value"),
  gradeBoost: document.querySelector("#setting-boost-value"),
  toneExposure: document.querySelector("#setting-exposure-value"),
  animationSpeed: document.querySelector("#setting-speed-value"),
};

const gl = canvas.getContext("webgl2", {
  alpha: false,
  antialias: false,
  depth: false,
  premultipliedAlpha: false,
  stencil: false,
  powerPreference: "high-performance",
});

let width = 0;
let height = 0;
let sceneTarget = null;

bindSettingsPanel();

if (!gl) {
  fail("WebGL2 is required for this shader port.");
} else {
  start().catch((error) => {
    console.error(error);
    fail(error.message || "Failed to initialize the shader.");
  });
}

async function start() {
  const [vertexSource, sceneSource, compositeSource] = await Promise.all([
    loadText("./shaders/fullscreen.vert"),
    loadText("./shaders/scene.frag"),
    loadText("./shaders/composite.frag"),
  ]);

  const sceneProgram = createProgram(vertexSource, sceneSource);
  const compositeProgram = createProgram(vertexSource, compositeSource);
  const noiseTexture = createNoiseTexture(NOISE_SIZE);
  const quadVao = gl.createVertexArray();

  gl.disable(gl.BLEND);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.DEPTH_TEST);
  gl.bindVertexArray(quadVao);

  const sceneUniforms = {
    iResolution: gl.getUniformLocation(sceneProgram, "iResolution"),
    iTime: gl.getUniformLocation(sceneProgram, "iTime"),
    iChannel0: gl.getUniformLocation(sceneProgram, "iChannel0"),
    iChannelResolution: gl.getUniformLocation(sceneProgram, "iChannelResolution[0]"),
    uWobble: gl.getUniformLocation(sceneProgram, "uWobble"),
    uDarkMode: gl.getUniformLocation(sceneProgram, "uDarkMode"),
    uMaxDisperse: gl.getUniformLocation(sceneProgram, "uMaxDisperse"),
    uMaxBounce: gl.getUniformLocation(sceneProgram, "uMaxBounce"),
    uAnimationSpeed: gl.getUniformLocation(sceneProgram, "uAnimationSpeed"),
  };

  const compositeUniforms = {
    iResolution: gl.getUniformLocation(compositeProgram, "iResolution"),
    iChannel0: gl.getUniformLocation(compositeProgram, "iChannel0"),
    uFocusPoint: gl.getUniformLocation(compositeProgram, "uFocusPoint"),
    uFocusScale: gl.getUniformLocation(compositeProgram, "uFocusScale"),
    uMaxBlurSize: gl.getUniformLocation(compositeProgram, "uMaxBlurSize"),
    uGradeGamma: gl.getUniformLocation(compositeProgram, "uGradeGamma"),
    uGradeBoost: gl.getUniformLocation(compositeProgram, "uGradeBoost"),
    uToneExposure: gl.getUniformLocation(compositeProgram, "uToneExposure"),
  };

  window.addEventListener("resize", resize);
  resize();

  const render = (now) => {
    resize();
    renderScene(sceneProgram, sceneUniforms, noiseTexture, now * 0.001);
    renderComposite(compositeProgram, compositeUniforms);
    requestAnimationFrame(render);
  };

  requestAnimationFrame(render);
}

function bindSettingsPanel() {
  syncControlValues();
  applyTheme();

  Object.entries(controls).forEach(([key, input]) => {
    if (!input) {
      return;
    }

    input.addEventListener("input", () => {
      const meta = SETTING_META[key];
      if (meta.type === "boolean") {
        settings[key] = input.checked;
      } else {
        settings[key] = sanitizeValue(key, input.valueAsNumber);
      }

      syncControlValues();
      applyTheme();
      persistSettings();
    });
  });

  resetButton?.addEventListener("click", () => {
    Object.assign(settings, structuredClone(DEFAULT_SETTINGS));
    syncControlValues();
    applyTheme();
    persistSettings();
  });
}

function syncControlValues() {
  Object.entries(controls).forEach(([key, input]) => {
    if (!input) {
      return;
    }

    const meta = SETTING_META[key];
    const value = settings[key];

    if (meta.type === "boolean") {
      input.checked = value;
      return;
    }

    input.value = String(value);

    if (outputs[key]) {
      const decimals = meta.step < 1 ? Math.max(0, String(meta.step).split(".")[1]?.length || 0) : 0;
      outputs[key].textContent = Number(value).toFixed(decimals);
    }
  });
}

function applyTheme() {
  document.body.dataset.theme = settings.darkMode ? "dark" : "light";
}

function loadSettings() {
  const next = structuredClone(DEFAULT_SETTINGS);

  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return next;
    }

    const parsed = JSON.parse(raw);
    Object.keys(DEFAULT_SETTINGS).forEach((key) => {
      next[key] = sanitizeValue(key, parsed[key]);
    });
  } catch (error) {
    console.warn("Unable to restore saved settings", error);
  }

  return next;
}

function persistSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn("Unable to persist settings", error);
  }
}

function sanitizeValue(key, value) {
  const meta = SETTING_META[key];
  const fallback = DEFAULT_SETTINGS[key];

  if (!meta) {
    return fallback;
  }

  if (meta.type === "boolean") {
    return Boolean(value);
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  const clamped = Math.min(meta.max, Math.max(meta.min, numeric));
  if (meta.step >= 1) {
    return Math.round(clamped);
  }

  const snapped = Math.round(clamped / meta.step) * meta.step;
  return Number(snapped.toFixed(6));
}

function fail(message) {
  if (status) {
    status.hidden = false;
    status.textContent = message;
  }
}

async function loadText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}`);
  }
  return response.text();
}

function createShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || "Unknown shader compile error";
    gl.deleteShader(shader);
    throw new Error(log);
  }

  return shader;
}

function createProgram(vertexSource, fragmentSource) {
  const vertexShader = createShader(gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) || "Unknown program link error";
    gl.deleteProgram(program);
    throw new Error(log);
  }

  return program;
}

function createNoiseTexture(size) {
  const texture = gl.createTexture();
  const data = new Uint8Array(size * size * 4);

  for (let index = 0; index < data.length; index += 4) {
    data[index] = Math.random() * 255;
    data[index + 1] = Math.random() * 255;
    data[index + 2] = Math.random() * 255;
    data[index + 3] = 255;
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return texture;
}

function createSceneTarget(targetWidth, targetHeight) {
  const hasFloatTarget = Boolean(gl.getExtension("EXT_color_buffer_float"));
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();

  gl.bindTexture(gl.TEXTURE_2D, texture);

  if (hasFloatTarget) {
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA16F,
      targetWidth,
      targetHeight,
      0,
      gl.RGBA,
      gl.HALF_FLOAT,
      null,
    );
  } else {
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      targetWidth,
      targetHeight,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
  }

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

  const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;

  if (!complete) {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      targetWidth,
      targetHeight,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);

  return { framebuffer, texture };
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, DPR_LIMIT);
  const nextWidth = Math.max(1, Math.round(window.innerWidth * dpr));
  const nextHeight = Math.max(1, Math.round(window.innerHeight * dpr));

  if (nextWidth === width && nextHeight === height) {
    return;
  }

  width = nextWidth;
  height = nextHeight;

  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;

  if (sceneTarget) {
    gl.deleteFramebuffer(sceneTarget.framebuffer);
    gl.deleteTexture(sceneTarget.texture);
  }

  sceneTarget = createSceneTarget(width, height);
}

function renderScene(program, uniforms, noiseTexture, time) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, sceneTarget.framebuffer);
  gl.viewport(0, 0, width, height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);

  gl.uniform3f(uniforms.iResolution, width, height, 1);
  gl.uniform1f(uniforms.iTime, time);
  gl.uniform3fv(uniforms.iChannelResolution, CHANNEL_RESOLUTION);
  gl.uniform1f(uniforms.uWobble, settings.wobble ? 1 : 0);
  gl.uniform1f(uniforms.uDarkMode, settings.darkMode ? 1 : 0);
  gl.uniform1i(uniforms.uMaxDisperse, settings.maxDisperse);
  gl.uniform1i(uniforms.uMaxBounce, settings.maxBounce);
  gl.uniform1f(uniforms.uAnimationSpeed, settings.animationSpeed);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, noiseTexture);
  gl.uniform1i(uniforms.iChannel0, 0);

  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function renderComposite(program, uniforms) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, width, height);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);

  gl.uniform3f(uniforms.iResolution, width, height, 1);
  gl.uniform1f(uniforms.uFocusPoint, settings.focusPoint);
  gl.uniform1f(uniforms.uFocusScale, settings.focusScale);
  gl.uniform1f(uniforms.uMaxBlurSize, settings.maxBlurSize);
  gl.uniform1f(uniforms.uGradeGamma, settings.gradeGamma);
  gl.uniform1f(uniforms.uGradeBoost, settings.gradeBoost);
  gl.uniform1f(uniforms.uToneExposure, settings.toneExposure);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sceneTarget.texture);
  gl.uniform1i(uniforms.iChannel0, 0);

  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
