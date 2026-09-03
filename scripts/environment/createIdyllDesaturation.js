// Tunnel seconds, saturation, and shared slope (per second). The zero endpoint
// slopes make the onset/end soft; shared interior slopes avoid five-second steps.
const SATURATION_KEYS = [
  [10, 1, 0],
  [15, 0.85, -0.035],
  [20, 0.65, -0.04],
  [25, 0.45, -0.04],
  [30, 0.25, -0.035],
  [35, 0.1, -0.025],
  [40, 0, 0],
];

export function getIdyllSaturation(tunnelTime) {
  if (tunnelTime <= SATURATION_KEYS[0][0]) return 1;
  if (tunnelTime >= SATURATION_KEYS.at(-1)[0]) return 0;
  const index = SATURATION_KEYS.findIndex(([time]) => time > tunnelTime);
  const [start, from, fromSlope] = SATURATION_KEYS[index - 1];
  const [end, to, toSlope] = SATURATION_KEYS[index];
  const span = end - start;
  const t = (tunnelTime - start) / span;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * from
    + (t3 - 2 * t2 + t) * span * fromSlope
    + (-2 * t3 + 3 * t2) * to
    + (t3 - t2) * span * toSlope;
}

/** A material-local color grade: no camera postprocess or extra render pass. */
export function createIdyllDesaturation(world) {
  const state = { saturation: 1 };
  const materials = new Set();
  const collect = (material) => {
    if (!material) return;
    if (material.subMaterials) material.subMaterials.forEach(collect);
    else materials.add(material);
  };
  // Includes the route extension and all instance sources, but never the Rift,
  // tunnel or White Room: those do not belong to the idyll's world container.
  world.getChildMeshes().forEach((mesh) => collect(mesh.material));

  class IdyllSaturationPlugin extends BABYLON.MaterialPluginBase {
    constructor(material) {
      super(material, "IdyllSaturation", 200, {}, true, true);
    }

    getClassName() { return "IdyllSaturationPlugin"; }

    getUniforms() {
      return {
        ubo: [{ name: "idyllSaturation", size: 1, type: "float" }],
        fragment: "uniform float idyllSaturation;",
      };
    }

    bindForSubMesh(uniformBuffer) {
      uniformBuffer.updateFloat("idyllSaturation", state.saturation);
    }

    getCustomCode(shaderType) {
      if (shaderType !== "fragment") return null;
      return {
        CUSTOM_FRAGMENT_MAIN_END: `
          if (idyllSaturation < 1.0) {
            // Grade after textures, lights, fog and image processing. Preserve
            // linear luminance, neutral RGB at zero saturation, and alpha.
            #ifdef IMAGEPROCESSINGPOSTPROCESS
              vec3 idyllLinear = gl_FragColor.rgb;
            #else
              vec3 idyllLinear = toLinearSpace(gl_FragColor.rgb);
            #endif
            float idyllLuminance = dot(idyllLinear, vec3(0.2126, 0.7152, 0.0722));
            vec3 idyllGraded = mix(vec3(idyllLuminance), idyllLinear, idyllSaturation);
            #ifdef IMAGEPROCESSINGPOSTPROCESS
              gl_FragColor.rgb = idyllGraded;
            #else
              gl_FragColor.rgb = toGammaSpace(idyllGraded);
            #endif
          }
        `,
      };
    }
  }

  materials.forEach((material) => new IdyllSaturationPlugin(material));
  return {
    get saturation() { return state.saturation; },
    update(tunnelTime) { state.saturation = getIdyllSaturation(tunnelTime); },
    reset() { state.saturation = 1; },
  };
}
