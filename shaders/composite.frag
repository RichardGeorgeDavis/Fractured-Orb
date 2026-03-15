#version 300 es
precision highp float;
precision highp sampler2D;

uniform vec3 iResolution;
uniform sampler2D iChannel0;
uniform float uFocusPoint;
uniform float uFocusScale;
uniform float uMaxBlurSize;
uniform float uGradeGamma;
uniform float uGradeBoost;
uniform float uToneExposure;

out vec4 outColor;

vec2 uPixelSize;
float uFar = 1.;

const float GOLDEN_ANGLE = 2.39996323;
const float RAD_SCALE = 1.;

float getBlurSize(float depth, float focusPoint, float focusScale) {
  float safeDepth = max(depth, 0.0001);
  float safeFocus = max(focusPoint, 0.0001);
  float coc = clamp((1.0 / safeFocus - 1.0 / safeDepth) * focusScale, -1.0, 1.0);
  return abs(coc) * uMaxBlurSize;
}

vec3 depthOfField(vec2 texCoord, float focusPoint, float focusScale) {
  vec4 centerTex = texture(iChannel0, texCoord);
  float centerDepth = max(centerTex.a * uFar, 0.0001);
  float centerSize = getBlurSize(centerDepth, focusPoint, focusScale);
  vec3 color = centerTex.rgb;
  float tot = 1.0;

  float radius = RAD_SCALE;
  for (float ang = 0.; ang < 10000.; ang += GOLDEN_ANGLE) {
    if (radius >= uMaxBlurSize) {
      break;
    }

    vec2 tc = texCoord + vec2(cos(ang), sin(ang)) * uPixelSize * radius;
    vec4 sampleTex = texture(iChannel0, tc);
    vec3 sampleColor = sampleTex.rgb;
    float sampleDepth = max(sampleTex.a * uFar, 0.0001);
    float sampleSize = getBlurSize(sampleDepth, focusPoint, focusScale);

    if (sampleDepth > centerDepth) {
      sampleSize = clamp(sampleSize, 0.0, centerSize * 2.0);
    }

    float m = smoothstep(radius - 0.5, radius + 0.5, sampleSize);
    color += mix(color / tot, sampleColor, m);
    tot += 1.0;
    radius += RAD_SCALE / radius;
  }

  return color / tot;
}

vec3 tonemap2(vec3 texColor) {
  texColor /= 2.;
  texColor *= uToneExposure;
  vec3 x = max(vec3(0), texColor - 0.004);
  return (x * (6.2 * x + .5)) / (x * (6.2 * x + 1.7) + 0.06);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord.xy / iResolution.xy;
  uPixelSize = vec2(.002) / (iResolution.xy / iResolution.y);

  vec3 col = depthOfField(uv, uFocusPoint, uFocusScale);
  col = pow(col, vec3(uGradeGamma)) * uGradeBoost;
  col = tonemap2(col);

  fragColor = vec4(col, 1);
}

void main() {
  mainImage(outColor, gl_FragCoord.xy);
}
