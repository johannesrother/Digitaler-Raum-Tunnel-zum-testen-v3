// Seconds relative to the existing Rift formation, not a second running clock.
// Keep the established early irritation; the later accompaniment now continues
// through the real Rift progress/crossing, without introducing a second clock.
export const PRE_RIFT_LIGHT_EVENTS = [
  { offset: -8, duration: 0.65, tail: 0.30, strength: 0.55, side: -1.02, height: 0.15, width: 2.2, spanY: 2.0, driftX: 0.28, driftY: 0.08 },
  { offset: -6.20, duration: 0.78, tail: 0.40, strength: 0.75, side: 0.98, height: 0.50, width: 2.4, spanY: 2.2, driftX: -0.34, driftY: -0.15 },
  { offset: -5.18, duration: 0.85, tail: 0.45, strength: 0.90, side: -0.38, height: 0.95, width: 2.7, spanY: 2.4, driftX: -0.16, driftY: -0.30 },
  { offset: -3.85, duration: 0.95, tail: 0.50, strength: 1.10, side: 1.00, height: -0.12, width: 2.7, spanY: 2.6, driftX: -0.50, driftY: 0.10 },
  { offset: -3.12, duration: 1.05, tail: 0.55, strength: 1.32, side: -0.60, height: -0.80, width: 2.9, spanY: 2.7, driftX: 0.35, driftY: 0.35 },
  { offset: -2.25, duration: 0.80, tail: 0.50, strength: 1.55, side: 0.60, height: 0.75, width: 3.0, spanY: 2.8, driftX: -0.50, driftY: -0.40 },
  { offset: -1.65, duration: 0.72, tail: 0.38, strength: 2.00, side: 0.00, height: 0.06, width: 3.2, spanY: 3.0, driftX: 0.20, driftY: -0.08 },
];

// Irrational angular steps distribute the slow, overlapping veils around the
// periphery. The late frontal events alternate with, rather than replace, them.
const RIFT_GLARE_EVENTS = [-1.20, -0.30, 0.55, 1.35, 2.25, 3.30, 4.40, 5.45].map((offset, index) => {
  const angle = 0.4 + index * 2.3999632297;
  const frontal = index === 2 || index === 5 || index === 7;
  return {
    offset, duration: 1.45 + (index % 3) * 0.17, tail: 0.60 + (index % 3) * 0.10,
    strength: frontal ? 1.8 : 1.15, side: Math.cos(angle) * (frontal ? 0.22 : 0.95),
    height: Math.sin(angle) * (frontal ? 0.18 : 0.80),
    width: frontal ? 3.0 : 2.6, spanY: frontal ? 2.8 : 2.7,
    driftX: -Math.cos(angle) * 0.30, driftY: -Math.sin(angle) * 0.24,
  };
});
export const CROSSING_AFTERIMAGE_DURATION = 2;
const smooth = (value) => { const p = Math.max(0, Math.min(1, value)); return p * p * (3 - 2 * p); };

export function riftGlareIntensity(time, formation, reveal, proximity) {
  const before = 0.20 + 0.25 * smooth((time + 8) / 4)
    + 0.20 * smooth((time + 4) / 3) + 0.10 * smooth(time + 1);
  // These are the existing aperture's reveal milestones, not elapsed-time
  // estimates. Formation bridges its first appearance to the actual reveal.
  const levels = [0.75, 0.80, 0.88, 0.94, 0.98];
  const step = Math.max(0, Math.min(4, reveal * 4));
  const index = Math.min(3, Math.floor(step));
  const opening = levels[index] + (levels[index + 1] - levels[index]) * smooth(step - index);
  return Math.min(1, before + opening - 0.75
    + 0.02 * formation * (1 - reveal) + 0.02 * proximity);
}

const REFLECTION_DEPTH = 1.5;
const MAX_REFLECTION_ALPHA = 0.92;
const AFTERIMAGE_ALPHA = 0.045;
const MAX_LOCAL_LIGHT_INTENSITY = 0.32;

/** Head-relative binocular glare, soft afterimages and secondary world light.
 * No global exposure changes, render targets, postprocesses or DOM overlay.
 */
export function createPreRiftLightDisturbance(scene, world) {
  const texture = createSoftReflectionTexture(scene);
  const warm = new BABYLON.Color3(1, 0.94, 0.82);
  const neutral = new BABYLON.Color3(1, 0.99, 0.97);
  // Reusable pool: early events, overlapping opening veils and three spatial
  // crossing lobes. No per-frame geometry, texture or postprocess allocation.
  const slots = Array.from({ length: 8 }, (_, index) => {
    const material = new BABYLON.StandardMaterial(`pre-rift-reflection-material-${index}`, scene);
    material.disableLighting = true;
    material.diffuseColor = BABYLON.Color3.Black();
    material.specularColor = BABYLON.Color3.Black();
    material.emissiveColor = warm.clone();
    material.opacityTexture = texture;
    material.alpha = 0;
    material.alphaMode = BABYLON.Engine.ALPHA_ADD;
    material.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
    material.disableDepthWrite = true;
    // Glare belongs to perception: nearby grass must not occlude it. This is
    // material-local, never a persistent change to the engine's depth state.
    material.depthFunction = BABYLON.Constants.ALWAYS;
    material.backFaceCulling = false;
    const mesh = BABYLON.MeshBuilder.CreatePlane(`pre-rift-soft-reflection-${index}`, { size: 1 }, scene);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.alwaysSelectAsActiveMesh = true;
    // Draw after alpha-blended vegetation (whose default index is MAX_VALUE),
    // without changing any existing mesh or rendering-group configuration.
    mesh.alphaIndex = Number.POSITIVE_INFINITY;
    // Only our perception veils render after the existing portal layers.
    // Never change their group IDs, stencil materials or auto-clear settings.
    mesh.renderingGroupId = 3;
    mesh.setEnabled(false);
    return { mesh, material };
  });
  const light = new BABYLON.PointLight("pre-rift-local-reflection", BABYLON.Vector3.Zero(), scene);
  light.intensity = 0;
  light.range = 8;
  light.diffuse.copyFrom(warm);
  light.specular.copyFrom(warm);
  light.includedOnlyMeshes = world.getChildMeshes().filter((mesh) => (
    mesh.getTotalVertices() > 0 && !/sky|dome|atmosphere/i.test(mesh.name)
  ));
  light.setEnabled(false);
  let active = false;
  let crossedAt = null;
  let crossingVeils = [];

  const hide = () => {
    light.intensity = 0;
    light.setEnabled(false);
    slots.forEach((slot) => {
      slot.mesh.setEnabled(false);
      slot.material.alpha = 0;
    });
    active = false;
  };
  const reset = () => { hide(); crossedAt = null; crossingVeils = []; };

  return {
    reset,
    update(elapsed, riftFormationStart, { formation = 0, reveal = 0, entryDistance = -Infinity, entered = false } = {}) {
      const time = elapsed - riftFormationStart;
      if (time < PRE_RIFT_LIGHT_EVENTS[0].offset
        || (crossedAt !== null && elapsed - crossedAt >= CROSSING_AFTERIMAGE_DURATION)) {
        if (active) hide();
        return;
      }
      const camera = scene.activeCamera;
      if (!camera) return;
      // Use the eye projection for XR, not the double-wide stereo canvas.
      // One head-relative plane is rendered through BOTH real eye cameras at
      // 1.5 m depth, with binocular disparity and the headset's live pose.
      const projection = (camera.rigCameras?.[0] ?? camera).getProjectionMatrix().m;
      const depth = Math.max(REFLECTION_DEPTH, camera.minZ * 4);
      const halfWidth = depth / Math.max(Math.abs(projection[0]), 0.001);
      const halfHeight = depth / Math.max(Math.abs(projection[5]), 0.001);
      const forwardSign = scene.useRightHandedSystem ? -1 : 1;
      // Distance only shapes anticipation; ONLY the existing entered flag
      // starts the one-shot crossing tail. No new entry threshold or timer.
      const proximity = entered ? 1 : reveal * smooth(1 + Math.min(entryDistance, 0) / 2.4);
      const intensity = riftGlareIntensity(time, formation, reveal, proximity);
      let veils = [];
      let tail = 1;
      if (crossedAt !== null) {
        veils = crossingVeils;
        tail = 1 - smooth((elapsed - crossedAt) / CROSSING_AFTERIMAGE_DURATION);
      } else {
        const addEvent = (event, colorProgress, gain, sizeGain, afterimage, softBlend = false) => {
          const age = time - event.offset;
          if (age <= 0 || age >= event.duration + event.tail) return;
          const progress = Math.min(age / event.duration, 1);
          const drift = smooth(progress);
          const envelope = age < event.duration ? Math.sin(Math.PI * progress) ** 2 : 0;
          const residue = age < event.duration ? drift : (1 - (age - event.duration) / event.tail) ** 2;
          veils.push({
            side: event.side + drift * event.driftX, height: event.height + drift * event.driftY,
            width: event.width * sizeGain, spanY: event.spanY * sizeGain,
            strength: event.strength * gain, colorProgress, softBlend,
            alpha: Math.min(0.98, MAX_REFLECTION_ALPHA * envelope + afterimage * residue),
            worldStrength: event.strength * gain * envelope,
          });
        };
        PRE_RIFT_LIGHT_EVENTS.forEach((event, index) => addEvent(
          event, index / (PRE_RIFT_LIGHT_EVENTS.length - 1),
          1 + 0.25 * smooth((time + 3) / 3), 1, AFTERIMAGE_ALPHA,
        ));
        RIFT_GLARE_EVENTS.forEach((event) => addEvent(
          event, 1, (0.65 + intensity * 0.85) * (1 - 0.70 * proximity),
          1 + 0.12 * intensity, 0.07 + 0.06 * intensity,
        ));
        // Soft, continuously moving peripheral residue connects the opening
        // events. It never becomes a flat full-screen exposure override.
        const surround = smooth((time + 1.2) / 1.4) * (1 - 0.8 * proximity);
        if (surround > 0) veils.push(
          {
            side: Math.cos(time * 1.25) * 0.90, height: Math.sin(time * 0.93) * 0.70,
            width: 3.4, spanY: 3.2, strength: 1,
            alpha: 0.48 * surround, colorProgress: 1, worldStrength: 0, softBlend: true,
          },
          {
            side: -Math.cos(time * 0.87 + 0.6) * 0.95, height: -Math.sin(time * 1.17) * 0.80,
            width: 3.4, spanY: 3.2, strength: 1,
            alpha: 0.36 * surround * (0.65 + 0.35 * formation), colorProgress: 1, worldStrength: 0, softBlend: true,
          },
        );
        if (proximity > 0) {
          [
            { side: -0.90, height: 0.28, width: 3.6, spanY: 3.6, strength: 1.6 },
            { side: 0.90, height: -0.24, width: 3.6, spanY: 3.6, strength: 1.6 },
            { side: 0.02, height: 0.10, width: 4.2, spanY: 3.8, strength: 2.7 },
          ].forEach((veil) => veils.push({ ...veil, alpha: 0.92 * proximity, colorProgress: 1, worldStrength: proximity, softBlend: true }));
        }
        if (entered) {
          crossedAt = elapsed;
          crossingVeils = veils;
        }
      }
      active = true;
      // Keep the light slot stable between impulses; its zero intensity in the
      // gaps has no visible effect. Retire it with the short crossing tail.
      light.setEnabled(true);
      light.intensity = 0;
      slots.forEach(({ mesh, material }) => { mesh.setEnabled(false); material.alpha = 0; });
      let strongest = 0;
      veils.forEach((veil, index) => {
        const slot = slots[index];
        slot.mesh.parent = camera;
        slot.mesh.layerMask = camera.layerMask;
        slot.mesh.position.set(
          veil.side * halfWidth,
          veil.height * halfHeight,
          forwardSign * depth,
        );
        slot.mesh.scaling.set(veil.width * halfWidth, veil.spanY * halfHeight, 1);
        const color = BABYLON.Color3.Lerp(warm, neutral, veil.colorProgress);
        // Preserve the additive reflections. Dense continuous veils blend
        // toward neutral white instead of adding unbounded radiance: the
        // landscape/portal remains underneath even at the crossing peak.
        slot.material.alphaMode = veil.softBlend ? BABYLON.Engine.ALPHA_COMBINE : BABYLON.Engine.ALPHA_ADD;
        slot.material.emissiveColor.copyFrom(color).scaleInPlace(veil.softBlend ? 2 : veil.strength);
        slot.material.alpha = (veil.softBlend ? 1 - (1 - veil.alpha) ** veil.strength : veil.alpha) * tail;
        slot.mesh.setEnabled(true);
        const strength = veil.worldStrength * tail;
        if (strength > strongest) {
          strongest = strength;
          camera.parent?.computeWorldMatrix(true);
          camera.computeWorldMatrix(true);
          slot.mesh.computeWorldMatrix(true);
          light.position.copyFrom(slot.mesh.getAbsolutePosition());
          light.position.y = Math.min(light.position.y, camera.globalPosition.y + 0.35);
          light.diffuse.copyFrom(color);
          light.specular.copyFrom(color);
          light.intensity = MAX_LOCAL_LIGHT_INTENSITY * strength / PRE_RIFT_LIGHT_EVENTS.at(-1).strength;
        }
      });
    },
  };
}

function createSoftReflectionTexture(scene) {
  const size = 128;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size * 2 - 1;
      const v = (y + 0.5) / size * 2 - 1;
      // Overlapping asymmetric lobes, tapered to exactly zero at the border:
      // no disc outline, rectangular edge or conventional lens-flare rings.
      const cloud = 0.72 * Math.exp(-3.2 * ((u + 0.10) ** 2 + (v - 0.05) ** 2))
        + 0.28 * Math.exp(-7 * ((u - 0.32) ** 2 + (v + 0.22) ** 2));
      const edge = Math.max(0, 1 - u * u) ** 2 * Math.max(0, 1 - v * v) ** 2;
      const offset = (y * size + x) * 4;
      const alpha = x === 0 || y === 0 || x === size - 1 || y === size - 1 ? 0 : Math.round(255 * edge * cloud);
      pixels.set([255, 255, 255, alpha], offset);
    }
  }
  const texture = BABYLON.RawTexture.CreateRGBATexture(
    pixels, size, size, scene, false, false, BABYLON.Texture.BILINEAR_SAMPLINGMODE,
  );
  texture.hasAlpha = true;
  texture.getAlphaFromRGB = false;
  texture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
  return texture;
}
