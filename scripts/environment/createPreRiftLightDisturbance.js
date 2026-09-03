// Seconds relative to the existing Rift formation, not a second running clock.
// Irregular onsets, soft envelopes and a final 0.55 s quiet gap avoid a strobe.
export const PRE_RIFT_LIGHT_EVENTS = [
  { offset: -8, duration: 0.44, strength: 0.16, side: -0.48, height: 0.10, width: 1.5, drift: 0.45 },
  { offset: -6.20, duration: 0.54, strength: 0.26, side: 0.42, height: -0.12, width: 2.1, drift: -0.7 },
  { offset: -5.18, duration: 0.62, strength: 0.36, side: -0.22, height: 0.26, width: 2.5, drift: 0.8 },
  { offset: -3.85, duration: 0.70, strength: 0.47, side: 0.50, height: 0.08, width: 3.0, drift: -1.0 },
  { offset: -3.12, duration: 0.76, strength: 0.60, side: -0.40, height: -0.18, width: 3.5, drift: 1.1 },
  { offset: -2.25, duration: 0.84, strength: 0.73, side: 0.30, height: 0.21, width: 4.0, drift: -1.25 },
  { offset: -1.65, duration: 1.10, strength: 1, side: -0.12, height: -0.02, width: 4.8, drift: 1.4 },
];

const REFLECTION_DEPTH = 7;
const MAX_REFLECTION_ALPHA = 0.24;
const MAX_LOCAL_LIGHT_INTENSITY = 1.8;

/** Two depth-tested world-space glints and one local, shadowless light.
 * No scene grading, render targets, postprocesses or camera/UI modifications.
 */
export function createPreRiftLightDisturbance(scene, world) {
  const texture = createSoftReflectionTexture(scene);
  const warm = new BABYLON.Color3(1, 0.89, 0.68);
  const neutral = new BABYLON.Color3(1, 0.98, 0.94);
  const slots = Array.from({ length: 2 }, (_, index) => {
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
    material.backFaceCulling = false;
    const mesh = BABYLON.MeshBuilder.CreatePlane(`pre-rift-soft-reflection-${index}`, { size: 1 }, scene);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
    mesh.setEnabled(false);
    return { mesh, material, eventIndex: -1, anchor: BABYLON.Vector3.Zero(), right: BABYLON.Vector3.Right() };
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
      slot.eventIndex = -1;
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
      active = true;
      // Keep the light slot stable between impulses; its zero intensity in the
      // gaps has no visible effect. Retire it completely before Rift formation.
      light.setEnabled(true);
      light.intensity = 0;
      slots.forEach(({ mesh, material }) => { mesh.setEnabled(false); material.alpha = 0; });
      let strongest = 0;
      PRE_RIFT_LIGHT_EVENTS.forEach((event, index) => {
        const progress = (time - event.offset) / event.duration;
        if (progress <= 0 || progress >= 1) return;
        const envelope = Math.sin(Math.PI * progress) ** 2;
        const strength = event.strength * envelope;
        const slot = slots[index % slots.length];
        if (slot.eventIndex !== index) {
          // Anchor once in world space. Head movement/translation then gives
          // real parallax instead of pinning a bright patch to either XR eye.
          camera.parent?.computeWorldMatrix(true);
          camera.computeWorldMatrix(true);
          const matrix = camera.getWorldMatrix();
          const forward = camera.getForwardRay().direction;
          slot.right.copyFrom(BABYLON.Vector3.TransformNormal(BABYLON.Vector3.Right(), matrix)).normalize();
          const up = BABYLON.Vector3.TransformNormal(BABYLON.Vector3.Up(), matrix).normalize();
          slot.anchor.copyFrom(camera.globalPosition)
            .addInPlace(forward.scale(REFLECTION_DEPTH))
            .addInPlace(slot.right.scale(event.side * REFLECTION_DEPTH))
            .addInPlace(up.scale(event.height * REFLECTION_DEPTH));
          slot.eventIndex = index;
        }
        slot.mesh.position.copyFrom(slot.anchor).addInPlace(slot.right.scale((progress - 0.5) * event.drift));
        slot.mesh.scaling.set(event.width, event.width * (0.38 + index * 0.025), 1);
        slot.material.emissiveColor.copyFrom(BABYLON.Color3.Lerp(warm, neutral, index / (PRE_RIFT_LIGHT_EVENTS.length - 1)));
        slot.material.alpha = MAX_REFLECTION_ALPHA * strength;
        slot.mesh.setEnabled(true);
        if (strength > strongest) {
          strongest = strength;
          light.position.copyFrom(slot.mesh.position);
          // Reflect onto the nearby meadow rather than lighting the sky.
          light.position.y = Math.min(light.position.y, camera.globalPosition.y + 0.35);
          light.diffuse.copyFrom(slot.material.emissiveColor);
          light.specular.copyFrom(slot.material.emissiveColor);
          light.intensity = MAX_LOCAL_LIGHT_INTENSITY * strength;
        }
      });
    },
  };
}

function createSoftReflectionTexture(scene) {
  const size = 64;
  const pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const radius = Math.hypot((x + 0.5) / size * 2 - 1, (y + 0.5) / size * 2 - 1);
      const edge = Math.max(0, 1 - radius * radius);
      const offset = (y * size + x) * 4;
      pixels.set([255, 255, 255, Math.round(255 * edge ** 3)], offset);
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
