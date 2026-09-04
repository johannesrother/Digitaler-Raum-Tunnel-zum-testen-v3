/**
 * A seamless, emissive void for the five-second release after the tunnel.
 * The visitor is enclosed by a very large inverted sphere, so no room edges,
 * corners, lights or horizon line become readable.
 */
export function createWhiteRoom(scene, tunnelEnd, exitDirection) {
  const finalPosition = tunnelEnd.add(exitDirection.scale(3.2));
  const voidMesh = BABYLON.MeshBuilder.CreateSphere(
    "white-room-endless-void",
    {
      diameter: 180,
      segments: 16,
      sideOrientation: BABYLON.Mesh.BACKSIDE,
    },
    scene,
  );
  voidMesh.position.copyFrom(finalPosition);
  const material = createVoidMaterial(scene);
  voidMesh.material = material;
  voidMesh.isPickable = false;
  voidMesh.setEnabled(false);

  const originalClearColor = scene.clearColor.clone();
  const originalFogDensity = scene.fogDensity;

  return {
    finalPosition,
    preview(amount) {
      const blend = BABYLON.Scalar.Clamp(amount, 0, 1);
      // The enclosing sphere would intersect the visible transparent idyll.
      // Keep it hidden until the existing handoff completes under pure white.
      voidMesh.setEnabled(false);
      material.alpha = blend;
      material.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
      scene.clearColor = new BABYLON.Color4(
        BABYLON.Scalar.Lerp(originalClearColor.r, 1, blend),
        BABYLON.Scalar.Lerp(originalClearColor.g, 1, blend),
        BABYLON.Scalar.Lerp(originalClearColor.b, 1, blend),
        1,
      );
      scene.fogDensity = BABYLON.Scalar.Lerp(originalFogDensity, 0, blend);
    },
    activate() {
      this.preview(1);
      voidMesh.setEnabled(true);
    },
    reset() {
      voidMesh.setEnabled(false);
      material.alpha = 0;
      scene.clearColor = originalClearColor.clone();
      scene.fogDensity = originalFogDensity;
    },
    dispose() {
      scene.clearColor = originalClearColor;
      scene.fogDensity = originalFogDensity;
      material.dispose();
      voidMesh.dispose();
    },
  };
}

function createVoidMaterial(scene) {
  const material = new BABYLON.StandardMaterial("white-room-neutral-void", scene);
  material.diffuseColor = BABYLON.Color3.White();
  material.emissiveColor = BABYLON.Color3.White();
  material.specularColor = BABYLON.Color3.Black();
  material.disableLighting = true;
  material.backFaceCulling = false;
  return material;
}
