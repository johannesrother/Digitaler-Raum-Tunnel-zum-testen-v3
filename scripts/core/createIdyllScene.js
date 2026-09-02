import { createDesktopCamera } from "../camera/createDesktopCamera.js";
import { createIdyllEnvironment } from "../environment/createIdyllEnvironment.js";
import { createDreamyIdyll } from "../environment/createDreamyIdyll.js";
import { createOrganicTunnel } from "../tunnel/createOrganicTunnel.js";
import { clearTunnelTerrain, removeIdyllObjectsFromTunnel } from "../tunnel/clearTunnelTerrain.js";
import { createIdyllTunnelTransition } from "../tunnel/createIdyllTunnelTransition.js";
import { createWhiteRoom } from "../whiteRoom/createWhiteRoom.js";
import { createWhiteRoomTone } from "../audio/createWhiteRoomTone.js";
import { createTunnelSound } from "../audio/createTunnelSound.js";
import { createIdyllSound } from "../audio/createIdyllSound.js";
import { createRiftSound } from "../audio/createRiftSound.js";
import { createSuctionSound } from "../audio/createSuctionSound.js";

/** Creates the static, standing-height idyll scene. WebXR is added separately. */
export async function createIdyllScene(
  engine,
  canvas,
  { onWhiteRoomEntry, onWhiteRoomSoundStarted, onWhiteRoomSoundEnded } = {},
) {
  const scene = new BABYLON.Scene(engine);
  scene.skipPointerMovePicking = true;

  const environment = await createIdyllEnvironment(scene);
  const dreamyIdyll = await createDreamyIdyll(scene, environment.startPosition);
  disableOldIdyllVisuals(environment);
  disablePreviousIdyllLighting(environment);
  // Rift, tunnel route and White Room share this independent landscape anchor.
  // The house remains a static idyll object and provides no portal transform.
  environment.architecture.entrance = createMeadowRiftEntrance();
  const desktopCamera = createDesktopCamera(
    scene,
    canvas,
    dreamyIdyll.startPosition,
    dreamyIdyll.house.approachTarget,
  );
  const tunnel = createOrganicTunnel(scene, {
    entrance: environment.architecture.entrance,
    grassMaterial: environment.materials.terrain,
    getGroundHeight: environment.terrain.getGroundHeight,
  });
  // The V3 tunnel is a transparent membrane. Extend the existing idyll along
  // its real route before the transition snapshots the world mesh set.
  dreamyIdyll.extendAlongTunnelRoute(tunnel.route);
  clearTunnelTerrain(
    [
      environment.terrain.terrain,
      environment.terrain.distantHorizon,
      ...environment.terrain.groundCoverZones,
    ],
    tunnel.route,
  );
  removeIdyllObjectsFromTunnel(environment.assets.placed, tunnel.route);
  environment.lighting.excludeFromTunnel(tunnel.mesh);
  dreamyIdyll.excludeFromTunnel(tunnel.mesh);
  const tunnelExit = tunnel.route.positionAt(0.986);
  const exitDirection = tunnel.route.tangentAt(0.986);
  exitDirection.y = 0;
  exitDirection.normalize();
  const whiteRoom = createWhiteRoom(scene, tunnelExit, exitDirection);
  const idyllSound = createIdyllSound();
  const riftSound = createRiftSound();
  const suctionSound = createSuctionSound();
  const tunnelSound = createTunnelSound();
  const whiteRoomTone = createWhiteRoomTone({
    onActivate: onWhiteRoomSoundStarted,
    onEnded: onWhiteRoomSoundEnded,
  });
  const transition = createIdyllTunnelTransition(scene, {
    startPosition: dreamyIdyll.startPosition,
    entrance: environment.architecture.entrance,
    desktopCamera,
    tunnel,
    tunnelEntrance: environment.architecture.tunnel,
    entranceFade: environment.architecture.tunnel.fade,
    initialForward: desktopCamera.getForwardRay(1).direction.clone(),
    whiteRoom,
    whiteRoomTone,
    onRiftOpening: () => riftSound.start(),
    onSuctionStart: () => {
      suctionSound.start();
      tunnelSound.fadeTo(0.28, 8);
    },
    onWhiteRoomEntry: () => {
      onWhiteRoomEntry?.();
      tunnelSound.fadeOutAndStop(2);
      suctionSound.fadeOutAndStop(2);
    },
    onTunnelEntry: () => {
      idyllSound.fadeOutAndStop(2.5);
      riftSound.fadeOutAndStop(2.5);
      tunnelSound.start({ fadeInDuration: 2.5 });
    },
    onIdyllHidden: () => dreamyIdyll.hide(),
    onExperienceReset: () => {
      idyllSound.stop();
      riftSound.stop();
      suctionSound.stop();
      tunnelSound.stop();
      whiteRoomTone.deactivate();
      dreamyIdyll.show();
    },
    idyllWorldMeshes: scene.meshes.filter((mesh) => (
      mesh !== tunnel.mesh && mesh.name !== "white-room-endless-void"
    )),
    previousWorldMeshes: scene.meshes.filter((mesh) => mesh.name !== "white-room-endless-void"),
    previousWorldLights: [...scene.lights],
  });
  scene.metadata = {
    environment,
    dreamyIdyll,
    desktopCamera,
    tunnel,
    transition,
    whiteRoom,
    whiteRoomTone,
    idyllSound,
    riftSound,
    suctionSound,
    tunnelSound,
  };

  return scene;
}

function createMeadowRiftEntrance() {
  const center = new BABYLON.Vector3(-20, 0, 17.5);
  const forward = new BABYLON.Vector3(0, 0, 1);
  return {
    center,
    forward,
    lateral: new BABYLON.Vector3(forward.z, 0, -forward.x),
  };
}

function disablePreviousIdyllLighting(environment) {
  environment.lighting.skyFill.setEnabled(false);
  environment.lighting.sun.setEnabled(false);
}

function disableOldIdyllVisuals(environment) {
  [
    environment.lighting.sky,
    environment.terrain.terrain,
    environment.terrain.distantHorizon,
    ...environment.terrain.groundCoverZones,
    ...environment.water.pools,
    environment.water.stream,
    ...environment.assets.placed.flatMap((entry) => entry.meshes),
  ].forEach((mesh) => mesh.setEnabled(false));
}
