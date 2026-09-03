/** One foreground quad blends the completed camera image toward pure white.
 * No scene-color/exposure changes, render target, or camera postprocess needed.
 * Babylon renders the layer per camera, including the XR eye views.
 */
export function createSuctionWhiteFade(scene) {
  const layer = new BABYLON.Layer(
    "suctions-end-white-blend", null, scene, false, new BABYLON.Color4(1, 1, 1, 0),
  );
  layer.texture = BABYLON.RawTexture.CreateRGBATexture(
    new Uint8Array([255, 255, 255, 255]), 1, 1, scene, false, false,
    BABYLON.Texture.NEAREST_SAMPLINGMODE,
  );
  layer.applyPostProcess = false;
  layer.isEnabled = false;
  // Prepare the tiny shader well before the existing suction event fires.
  layer.isReady();
  let startedAt = null;
  let endsAt = null;

  const setFade = (value) => {
    layer.color.a = value;
    layer.isEnabled = value > 0;
  };

  // Layer and its 1x1 texture are owned/disposed by the scene's layer component.
  return {
    get whiteFade() { return layer.color.a; },
    start(tunnelTime, tunnelEndTime) {
      if (startedAt !== null) return;
      startedAt = tunnelTime;
      endsAt = tunnelEndTime;
      setFade(0);
    },
    update(tunnelTime) {
      if (startedAt === null) return;
      const progress = BABYLON.Scalar.Clamp(
        (tunnelTime - startedAt) / Math.max(endsAt - startedAt, 0.001), 0, 1,
      );
      setFade(progress * progress * (3 - 2 * progress));
    },
    finish() {
      // Keep the same final white through the handoff and White Room: removing
      // the blend here would reveal a differently tone-mapped white for a frame.
      setFade(1);
    },
    returnToIdyll(progress) {
      startedAt = null;
      endsAt = null;
      // The audio supplies the shared eased progress; do not ease a second time.
      setFade(1 - BABYLON.Scalar.Clamp(progress, 0, 1));
    },
    reset() {
      startedAt = null;
      endsAt = null;
      setFade(0);
    },
  };
}
