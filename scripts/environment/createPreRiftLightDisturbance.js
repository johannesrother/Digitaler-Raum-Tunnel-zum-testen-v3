// Seconds relative to the existing Rift formation, not a second running clock.
// Irregular onsets, soft envelopes and a final 0.55 s quiet gap avoid a strobe.
export const PRE_RIFT_LIGHT_EVENTS = [
  { offset: -8, duration: 0.65, tail: 0.30, strength: 0.55, side: -1.02, height: 0.15, width: 2.2, spanY: 2.0, driftX: 0.28, driftY: 0.08 },
  { offset: -6.20, duration: 0.78, tail: 0.40, strength: 0.75, side: 0.98, height: 0.50, width: 2.4, spanY: 2.2, driftX: -0.34, driftY: -0.15 },
  { offset: -5.18, duration: 0.85, tail: 0.45, strength: 0.90, side: -0.38, height: 0.95, width: 2.7, spanY: 2.4, driftX: -0.16, driftY: -0.30 },
  { offset: -3.85, duration: 0.95, tail: 0.50, strength: 1.10, side: 1.00, height: -0.12, width: 2.7, spanY: 2.6, driftX: -0.50, driftY: 0.10 },
  { offset: -3.12, duration: 1.05, tail: 0.55, strength: 1.32, side: -0.60, height: -0.80, width: 2.9, spanY: 2.7, driftX: 0.35, driftY: 0.35 },
  { offset: -2.25, duration: 0.80, tail: 0.50, strength: 1.55, side: 0.60, height: 0.75, width: 3.0, spanY: 2.8, driftX: -0.50, driftY: -0.40 },
  { offset: -1.65, duration: 0.72, tail: 0.38, strength: 2.00, side: 0.00, height: 0.06, width: 3.2, spanY: 3.0, driftX: 0.20, driftY: -0.08 },
];

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
  // At most three events overlap, including their low-intensity tails.
  const slots = Array.from({ length: 3 }, (_, index) => {
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

  const reset = () => {
    light.intensity = 0;
    light.setEnabled(false);
    slots.forEach((slot) => {
      slot.mesh.setEnabled(false);
      slot.material.alpha = 0;
    });
    active = false;
  };

  return {
    reset,
    update(elapsed, riftFormationStart) {
      const time = elapsed - riftFormationStart;
      if (time < PRE_RIFT_LIGHT_EVENTS[0].offset || time >= -0.55) {
        if (active) reset();
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
      active = true;
      // Keep the light slot stable between impulses; its zero intensity in the
      // gaps has no visible effect. Retire it completely before Rift formation.
      light.setEnabled(true);
      light.intensity = 0;
      slots.forEach(({ mesh, material }) => { mesh.setEnabled(false); material.alpha = 0; });
      let strongest = 0;
      PRE_RIFT_LIGHT_EVENTS.forEach((event, index) => {
        const age = time - event.offset;
        if (age <= 0 || age >= event.duration + event.tail) return;
        const progress = Math.min(age / event.duration, 1);
        const drift = progress * progress * (3 - 2 * progress);
        const envelope = age < event.duration ? Math.sin(Math.PI * progress) ** 2 : 0;
        // A continuous, weak residue; no second flash at the main pulse's end.
        const residue = age < event.duration ? drift
          : (1 - (age - event.duration) / event.tail) ** 2;
        const strength = event.strength * envelope;
        const slot = slots[index % slots.length];
        slot.mesh.parent = camera;
        slot.mesh.layerMask = camera.layerMask;
        slot.mesh.position.set(
          (event.side + drift * event.driftX) * halfWidth,
          (event.height + drift * event.driftY) * halfHeight,
          forwardSign * depth,
        );
        slot.mesh.scaling.set(event.width * halfWidth, event.spanY * halfHeight, 1);
        const color = BABYLON.Color3.Lerp(warm, neutral, index / (PRE_RIFT_LIGHT_EVENTS.length - 1));
        slot.material.emissiveColor.copyFrom(color).scaleInPlace(event.strength);
        slot.material.alpha = Math.min(0.98, MAX_REFLECTION_ALPHA * envelope + AFTERIMAGE_ALPHA * residue);
        slot.mesh.setEnabled(true);
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
