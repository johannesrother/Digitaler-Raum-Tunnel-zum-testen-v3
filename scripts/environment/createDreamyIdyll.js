import { TUNNEL_DURATION, getTunnelDiameter } from "../tunnel/tunnelConfig.js";

const MEADOW_RADIUS = 62;
const CAMERA_START_RETREAT = 12;
const ROUTE_LANDSCAPE_EXTRA_LENGTH = 18;
const ROUTE_LANDSCAPE_HALF_WIDTH_START = 36;
const ROUTE_LANDSCAPE_HALF_WIDTH_END = 30;
const ROUTE_LANDSCAPE_SECTIONS = 48;
const ROUTE_LANDSCAPE_LATERAL_STEPS = 20;
const ROUTE_GRASS_COUNT = 9000;
const DENSE_GRASS_ZONES = [
  { count: 35000, innerRadius: 1.8, outerRadius: 22 },
  { count: 25000, innerRadius: 22, outerRadius: 42 },
  { count: 15000, innerRadius: 42, outerRadius: 58 },
];
const GRASS_SCALE_RANGE = [0.12, 0.17];
const HOUSE_ENTRANCE_CLEARANCE = 2.1;
const HOUSE_PATH_GRASS_CLEARANCE = 0.75;
const RIFT_GRASS_EXCLUSION_RADIUS = 1.45;
const MIN_GRASS_GROUND_NORMAL_Y = 0.96;
const GRASS_GROUND_OFFSET = 0.002;
const POLLEN_COUNT = 34;
const PACK_ROOT = "./assets/idylle%20pack/glTF/";
const TOON_SKYDOME_ROOT = "./assets/idylle/";
const TOON_SKYDOME_FILE = "Toon Skydome.glb";
const TOON_SKYDOME_SCALE = 13;
const HORIZON_HILLS_ROOT = "./assets/idylle/";
const HORIZON_HILLS_FILE = "hügel.glb";
const HOUSE_ROOT = "./assets/idylle/";
const HOUSE_FILE = "Haus.glb";
// The source model is 0.94 units high.  At 6.8× this yields a 6.4 m house
// with an approximately 2.1 m entrance, matching the visitor eye height.
const HOUSE_SCALE = 6.8;
const HOUSE_OFFSET = new BABYLON.Vector3(-9, 0, 20.7);
// `Haus.glb` has one combined mesh (`output_unwrapped`), so the doorway is not
// a separately addressable node.  Its visible entrance is on the source +Z
// facade. Rotate that facade toward the visitor, who approaches from world -Z.
const HOUSE_ROTATION_Y = Math.PI;
const HOUSE_DOOR_LOCAL_NORMAL = new BABYLON.Vector3(0, 0, 1);
const EMBEDDED_GRASS_ROOT = "./assets/idylle/";
const EMBEDDED_GRASS_FILE = "Gras.glb";
// Gras.glb spans local Y -0.1469…0.1531. Its square plate's upper surface
// was measured at about -0.140. It is part of the same mesh as the flowers,
// so bury the whole plate beneath the lowest terrain point it spans.
const EMBEDDED_GRASS_PLATE_TOP_Y = -0.14;
const EMBEDDED_GRASS_PLATE_HALF_EXTENT = 0.96;
const EMBEDDED_GRASS_PLATE_BURY = 0.08;
const EMBEDDED_GRASS_CLUSTER_CENTERS = [
  // Foreground / near meadow: visible from the initial camera while still
  // outside the house, path, and Rift exclusion areas.
  [-12, -10], [12, -11], [-24, -8], [22, -6], [-18, 8], [16, 8],
  [-26, -18], [17, -17], [-29, 14], [22, 16],
  [4, 32], [-10, -35], [32, 0],
];
const EMBEDDED_GRASS_PATCHES_PER_CLUSTER = 4;
const EMBEDDED_GRASS_PATCH_RADIUS = 1.15;

const HORIZON_HILL_LAYOUT = [
  { angle: 0.08, radius: 142, scale: [28, 13, 20], yaw: -0.64 },
  { angle: 1.32, radius: 138, scale: [31, 15, 22], yaw: 1.05 },
  { angle: 2.6, radius: 146, scale: [29, 14, 20], yaw: 0.7 },
  { angle: 3.78, radius: 140, scale: [32, 15, 22], yaw: 1.18 },
  { angle: 5.0, radius: 144, scale: [28, 13, 20], yaw: 0.46 },
];

/**
 * The one visible idyll world.  It intentionally contains only a small,
 * curated subset of the Quaternius Nature MegaKit rather than an asset dump.
 */
export async function createDreamyIdyll(scene, startPosition) {
  const world = new BABYLON.TransformNode("dreamy-idyll-world", scene);
  const meadow = createRollingMeadow(scene, world, startPosition);
  // These assets do not depend on one another. Starting them together makes
  // the visible idyll ready after the slowest load instead of their sum.
  const mountainsPromise = createDistantMountainLayers(scene, world, startPosition);
  const skyPromise = createDreamySky(scene, world, startPosition);
  const housePromise = createHouseTarget(scene, world, startPosition);
  const librariesPromise = loadNatureLibraries(scene, world);
  const embeddedGrassSourcePromise = loadEmbeddedGrassPatchSource(scene, world);
  const [mountains, sky, house, libraries, embeddedGrassSource] = await Promise.all([
    mountainsPromise,
    skyPromise,
    housePromise,
    librariesPromise,
    embeddedGrassSourcePromise,
  ]);
  const lights = createDreamyLighting(scene);
  const vegetation = placeNature(scene, world, libraries, startPosition, house, meadow);
  vegetation.buildGrass();
  createEmbeddedGrassPatches(
    world,
    startPosition,
    embeddedGrassSource,
    house,
    vegetation.entries,
  );
  const atmosphere = createAtmosphere(scene, world, startPosition, vegetation.swayAnchors, sky);
  let routeExtension = null;
  const cameraStartPosition = createRetreatedCameraStart(startPosition, house.position);

  return {
    world,
    meadow,
    mountains,
    sky,
    house,
    lights,
    vegetation,
    buildGrass: vegetation.buildGrass,
    startPosition: cameraStartPosition,
    meadowRadius: MEADOW_RADIUS,
    extendAlongTunnelRoute(route) {
      if (!routeExtension) {
        routeExtension = createRouteLandscapeExtension(
          scene,
          world,
          startPosition,
          route,
          meadow,
          mountains[0],
          libraries,
          vegetation,
        );
      }
      return routeExtension;
    },
    excludeFromTunnel(tunnelMesh) {
      lights.forEach((light) => light.excludedMeshes.push(tunnelMesh));
    },
    hide() {
      world.setEnabled(false);
      lights.forEach((light) => light.setEnabled(false));
    },
    show() {
      world.setEnabled(true);
      lights.forEach((light) => light.setEnabled(true));
    },
    dispose() {
      atmosphere.dispose();
    },
  };
}

async function loadEmbeddedGrassPatchSource(scene, world) {
  const container = await BABYLON.SceneLoader.LoadAssetContainerAsync(
    EMBEDDED_GRASS_ROOT,
    EMBEDDED_GRASS_FILE,
    scene,
  );
  container.lights.forEach((light) => light.dispose());
  container.cameras.forEach((camera) => camera.dispose());
  container.animationGroups.forEach((group) => group.stop());
  container.addAllToScene();
  container.rootNodes.forEach((root) => {
    root.parent = world;
    root.position.set(0, 0, 0);
    root.scaling.set(1, 1, 1);
    root.rotation.set(0, 0, 0);
    root.rotationQuaternion = null;
  });

  const source = container.meshes.find((mesh) => mesh.getTotalVertices() > 0);
  if (!source) throw new Error("Gras.glb did not contain a renderable vegetation mesh.");
  source.isVisible = false;
  source.isPickable = false;
  source.receiveShadows = false;
  if (source.material) source.material.backFaceCulling = false;
  return source;
}

function createEmbeddedGrassPatches(world, startPosition, source, house, vegetationEntries) {
  const patches = createEmbeddedGrassPatchLayout(startPosition, house, vegetationEntries);
  patches.forEach((patch, index) => {
    const instance = source.createInstance(`dreamy-embedded-grass-patch-${index + 1}`);
    const groundY = getEmbeddedGrassPlateGroundY(patch, startPosition);
    instance.parent = world;
    instance.position.set(
      startPosition.x + patch.x,
      groundY - EMBEDDED_GRASS_PLATE_TOP_Y * patch.scale - EMBEDDED_GRASS_PLATE_BURY,
      startPosition.z + patch.z,
    );
    instance.scaling.setAll(patch.scale);
    instance.rotation.y = patch.rotation;
    instance.isPickable = false;
    instance.receiveShadows = false;
  });
}

function getEmbeddedGrassPlateGroundY(patch, startPosition) {
  let lowestGroundY = Number.POSITIVE_INFINITY;
  const cosine = Math.cos(patch.rotation);
  const sine = Math.sin(patch.rotation);
  // The source plate is a rotated square. Sampling its center, edges, and
  // corners avoids a downhill edge ever poking through the rolling meadow.
  [-1, -0.5, 0, 0.5, 1].forEach((horizontal) => {
    [-1, -0.5, 0, 0.5, 1].forEach((vertical) => {
      const localX = horizontal * EMBEDDED_GRASS_PLATE_HALF_EXTENT * patch.scale;
      const localZ = vertical * EMBEDDED_GRASS_PLATE_HALF_EXTENT * patch.scale;
      const worldX = startPosition.x + patch.x + localX * cosine - localZ * sine;
      const worldZ = startPosition.z + patch.z + localX * sine + localZ * cosine;
      lowestGroundY = Math.min(lowestGroundY, getMeadowHeight(worldX, worldZ, startPosition));
    });
  });
  return lowestGroundY;
}

function createEmbeddedGrassPatchLayout(startPosition, house, vegetationEntries) {
  const random = createRandom(28471);
  const exclusions = createGrassExclusions(house, vegetationEntries);
  const patches = [];
  EMBEDDED_GRASS_CLUSTER_CENTERS.forEach(([centerX, centerZ]) => {
    let placed = 0;
    let attempts = 0;
    while (placed < EMBEDDED_GRASS_PATCHES_PER_CLUSTER && attempts < 96) {
      attempts += 1;
      const angle = random() * Math.PI * 2;
      const radius = 1.6 + random() * 3.4;
      const scale = BABYLON.Scalar.Lerp(0.94, 1.08, random());
      const patch = {
        x: centerX + Math.cos(angle) * radius,
        z: centerZ + Math.sin(angle) * radius,
        scale,
        rotation: random() * Math.PI * 2,
      };
      if (!isEmbeddedGrassPatchClear(patch, startPosition, house, exclusions)) continue;
      patches.push(patch);
      placed += 1;
    }
  });
  return patches;
}

function isEmbeddedGrassPatchClear(patch, startPosition, house, exclusions) {
  const radius = EMBEDDED_GRASS_PATCH_RADIUS * patch.scale;
  const worldX = startPosition.x + patch.x;
  const worldZ = startPosition.z + patch.z;
  const perimeter = [
    [0, 0], [radius, 0], [-radius, 0], [0, radius], [0, -radius],
    [radius * 0.72, radius * 0.72], [radius * 0.72, -radius * 0.72],
    [-radius * 0.72, radius * 0.72], [-radius * 0.72, -radius * 0.72],
  ];
  const entrance = {
    x: HOUSE_OFFSET.x,
    z: HOUSE_OFFSET.z - HOUSE_SCALE * 0.7114279866218567,
  };
  return perimeter.every(([offsetX, offsetZ]) => !isInsideGrassExclusion(
    worldX + offsetX,
    worldZ + offsetZ,
    exclusions,
  ))
    && distanceToSegment(patch, { x: 0, z: 0 }, entrance) >= HOUSE_PATH_GRASS_CLEARANCE + radius
    && Math.hypot(patch.x - entrance.x, patch.z - entrance.z) >= HOUSE_ENTRANCE_CLEARANCE + radius;
}

function createRollingMeadow(scene, world, startPosition) {
  const rings = 32;
  const sectors = 96;
  const positions = [startPosition.x, getMeadowHeight(startPosition.x, startPosition.z, startPosition), startPosition.z];
  const normals = [0, 1, 0];
  const colors = [0.36, 0.58, 0.28, 1];
  const indices = [];

  for (let ring = 1; ring <= rings; ring += 1) {
    const radius = MEADOW_RADIUS * ring / rings;
    for (let sector = 0; sector < sectors; sector += 1) {
      const angle = sector / sectors * Math.PI * 2;
      const organicEdge = 1 + Math.sin(angle * 5.0) * 0.025 + Math.sin(angle * 9.0 + 0.7) * 0.014;
      const x = startPosition.x + Math.cos(angle) * radius * organicEdge;
      const z = startPosition.z + Math.sin(angle) * radius * organicEdge;
      const shade = 0.93 + Math.sin(x * 0.25 + z * 0.17) * 0.045 + Math.cos(z * 0.43) * 0.025;
      positions.push(x, getMeadowHeight(x, z, startPosition), z);
      normals.push(0, 1, 0);
      colors.push(0.36 * shade, 0.58 * shade, 0.28 * shade, 1);
    }
  }

  for (let sector = 0; sector < sectors; sector += 1) {
    const next = (sector + 1) % sectors;
    indices.push(0, 1 + sector, 1 + next);
  }
  for (let ring = 1; ring < rings; ring += 1) {
    const inner = 1 + (ring - 1) * sectors;
    const outer = 1 + ring * sectors;
    for (let sector = 0; sector < sectors; sector += 1) {
      const next = (sector + 1) % sectors;
      indices.push(inner + sector, outer + sector, outer + next, inner + sector, outer + next, inner + next);
    }
  }
  BABYLON.VertexData.ComputeNormals(positions, indices, normals);
  const meadow = new BABYLON.Mesh("dreamy-rolling-meadow", scene);
  const vertexData = new BABYLON.VertexData();
  vertexData.positions = positions;
  vertexData.normals = normals;
  vertexData.colors = colors;
  vertexData.indices = indices;
  vertexData.applyToMesh(meadow);
  const material = new BABYLON.PBRMaterial("dreamy-meadow-material", scene);
  material.albedoColor = BABYLON.Color3.White();
  material.useVertexColors = true;
  material.metallic = 0;
  material.roughness = 0.98;
  material.environmentIntensity = 0.16;
  meadow.material = material;
  meadow.parent = world;
  meadow.metadata = { ...(meadow.metadata ?? {}), grassReceiver: true };
  meadow.isPickable = false;
  meadow.receiveShadows = true;
  return meadow;
}

function createRouteLandscapeExtension(
  scene,
  world,
  startPosition,
  route,
  meadow,
  hillSource,
  libraries,
  vegetation,
) {
  const terrain = [createRouteMeadowStrip(scene, world, startPosition, route, meadow.material)];
  const propExclusions = createRouteVegetation(
    scene,
    world,
    startPosition,
    route,
    libraries,
    vegetation,
  );
  const grass = createRouteGrass(scene, world, startPosition, route, libraries, propExclusions);
  const hills = createRouteHills(world, startPosition, route, hillSource);
  return {
    terrain,
    grass,
    hills,
    distanceCovered: route.length + ROUTE_LANDSCAPE_EXTRA_LENGTH,
  };
}

function createRouteMeadowStrip(scene, world, startPosition, route, material) {
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];
  const totalDistance = route.length + ROUTE_LANDSCAPE_EXTRA_LENGTH;

  for (let section = 0; section <= ROUTE_LANDSCAPE_SECTIONS; section += 1) {
    const progress = section / ROUTE_LANDSCAPE_SECTIONS;
    const distance = progress * totalDistance;
    const frame = routeLandscapeFrame(route, distance);
    const outerOffset = BABYLON.Scalar.Lerp(
      ROUTE_LANDSCAPE_HALF_WIDTH_START,
      ROUTE_LANDSCAPE_HALF_WIDTH_END,
      progress,
    );

    for (let lateralStep = 0; lateralStep <= ROUTE_LANDSCAPE_LATERAL_STEPS; lateralStep += 1) {
      const lateralRatio = lateralStep / ROUTE_LANDSCAPE_LATERAL_STEPS * 2 - 1;
      const edgeRatio = Math.abs(lateralRatio);
      const offset = outerOffset * lateralRatio;
      const x = frame.position.x + frame.lateral.x * offset;
      const z = frame.position.z + frame.lateral.z * offset;
      const y = getRouteLandscapeHeight(x, z, startPosition, progress, edgeRatio);
      const shade = 0.95 + Math.sin(x * 0.19 + z * 0.13) * 0.035;
      const distanceMute = BABYLON.Scalar.Lerp(1, 0.82, smoothstep(progress));
      positions.push(x, y, z);
      normals.push(0, 1, 0);
      colors.push(
        0.36 * shade * distanceMute,
        0.58 * shade * distanceMute,
        0.28 * shade * distanceMute,
        1,
      );
    }
  }

  const stride = ROUTE_LANDSCAPE_LATERAL_STEPS + 1;
  for (let section = 0; section < ROUTE_LANDSCAPE_SECTIONS; section += 1) {
    for (let lateralStep = 0; lateralStep < ROUTE_LANDSCAPE_LATERAL_STEPS; lateralStep += 1) {
      const current = section * stride + lateralStep;
      const next = current + stride;
      indices.push(current, next, next + 1, current, next + 1, current + 1);
    }
  }

  BABYLON.VertexData.ComputeNormals(positions, indices, normals);
  const mesh = new BABYLON.Mesh("dreamy-route-meadow-strip", scene);
  const vertexData = new BABYLON.VertexData();
  vertexData.positions = positions;
  vertexData.normals = normals;
  vertexData.colors = colors;
  vertexData.indices = indices;
  vertexData.applyToMesh(mesh);
  mesh.material = material;
  mesh.parent = world;
  mesh.isPickable = false;
  mesh.receiveShadows = false;
  mesh.metadata = { ...(mesh.metadata ?? {}), grassReceiver: true, routeLandscape: true };
  return mesh;
}

function createRouteVegetation(scene, world, startPosition, route, libraries, vegetation) {
  const random = createRandom(48271);
  const exclusions = [];
  const treeTypes = ["CommonTree_1", "CommonTree_3", "CommonTree_2", "CommonTree_4"];
  const undergrowthTypes = [
    ["Bush_Common", "bushes"],
    ["Bush_Common_Flowers", "bushes"],
    ["Fern_1", "plants"],
    ["Flower_3_Group", "flowers"],
  ];

  for (let index = 0; index < 28; index += 1) {
    const progress = 0.07 + index / 27 * 0.89;
    const frame = routeLandscapeFrame(route, progress * route.length);
    const side = index % 2 === 0 ? -1 : 1;
    const lateralDistance = (8 + random() * 17) * side;
    const x = frame.position.x + frame.lateral.x * lateralDistance;
    const z = frame.position.z + frame.lateral.z * lateralDistance;
    const groundY = getRouteLandscapeHeight(x, z, startPosition, progress, Math.abs(lateralDistance) / 36);
    const scale = BABYLON.Scalar.Lerp(0.88, 0.56, progress) * (0.9 + random() * 0.2);
    const name = `dreamy-route-tree-${index}`;
    const anchor = createInstanceGroup(scene, world, libraries[treeTypes[index % treeTypes.length]], name, {
      x,
      z,
      groundY,
      scale,
      rotation: random() * Math.PI * 2,
    }, startPosition);
    vegetation.entries.push({ anchor, prefix: name, kind: "trees" });
    vegetation.counts.trees += 1;
    exclusions.push({ x, z, radius: 1.25 * scale + 0.42 });
  }

  for (let index = 0; index < 42; index += 1) {
    const progress = 0.08 + random() * 0.87;
    const frame = routeLandscapeFrame(route, progress * route.length);
    const side = random() < 0.5 ? -1 : 1;
    const lateralDistance = (6 + random() * 21) * side;
    const x = frame.position.x + frame.lateral.x * lateralDistance;
    const z = frame.position.z + frame.lateral.z * lateralDistance;
    const groundY = getRouteLandscapeHeight(x, z, startPosition, progress, Math.abs(lateralDistance) / 36);
    const [libraryName, kind] = undergrowthTypes[index % undergrowthTypes.length];
    const scale = BABYLON.Scalar.Lerp(0.92, 0.62, progress) * (0.88 + random() * 0.2);
    const name = `dreamy-route-undergrowth-${index}`;
    const anchor = createInstanceGroup(scene, world, libraries[libraryName], name, {
      x,
      z,
      groundY,
      scale,
      rotation: random() * Math.PI * 2,
    }, startPosition);
    vegetation.entries.push({ anchor, prefix: name, kind });
    vegetation.counts[kind] += 1;
    vegetation.swayAnchors.push({ anchor, phase: random() * Math.PI * 2, kind });
    exclusions.push({ x, z, radius: 0.55 * scale + 0.18 });
  }
  return exclusions;
}

function createRouteGrass(scene, world, startPosition, route, libraries, exclusions) {
  const source = libraries.Grass_Common_Short.meshes[0];
  const grass = source.clone("dreamy-route-grass-thin-instances", world, true);
  // Thin-instance matrix buffers live on the mesh geometry. Detach this tiny
  // grass geometry before assigning the route matrices so the original
  // 75,000-instance meadow buffer remains untouched.
  grass.makeGeometryUnique();
  grass.parent = world;
  grass.position.set(0, 0, 0);
  grass.rotation.set(0, 0, 0);
  grass.scaling.setAll(1);
  grass.isVisible = true;
  grass.isPickable = false;
  grass.receiveShadows = false;
  grass.metadata = { ...(grass.metadata ?? {}), routeLandscape: true, lod: "thin-instance" };

  const random = createRandom(96113);
  const matrices = new Float32Array(ROUTE_GRASS_COUNT * 16);
  const assetBottom = source.getBoundingInfo().boundingBox.minimum.y;
  const scaling = new BABYLON.Vector3();
  const position = new BABYLON.Vector3();
  const rotation = new BABYLON.Quaternion();
  const matrix = BABYLON.Matrix.Identity();

  for (let index = 0; index < ROUTE_GRASS_COUNT; index += 1) {
    let point = null;
    for (let attempt = 0; attempt < 48 && !point; attempt += 1) {
      const progress = 0.045 + random() * 0.94;
      const frame = routeLandscapeFrame(route, progress * route.length);
      const tunnelGap = getTunnelDiameter(progress * TUNNEL_DURATION) * 0.5 + 1.05;
      const side = random() < 0.5 ? -1 : 1;
      const outer = BABYLON.Scalar.Lerp(31, 25, progress);
      const lateralDistance = BABYLON.Scalar.Lerp(tunnelGap, outer, Math.sqrt(random())) * side;
      const x = frame.position.x + frame.lateral.x * lateralDistance;
      const z = frame.position.z + frame.lateral.z * lateralDistance;
      if (!exclusions.some((zone) => Math.hypot(x - zone.x, z - zone.z) < zone.radius)) {
        point = { x, z, progress, edgeRatio: Math.abs(lateralDistance) / outer };
      }
    }
    if (!point) {
      const progress = 0.1 + index / ROUTE_GRASS_COUNT * 0.84;
      const frame = routeLandscapeFrame(route, progress * route.length);
      const lateralDistance = (8 + (index % 19)) * (index % 2 === 0 ? -1 : 1);
      point = {
        x: frame.position.x + frame.lateral.x * lateralDistance,
        z: frame.position.z + frame.lateral.z * lateralDistance,
        progress,
        edgeRatio: Math.abs(lateralDistance) / 31,
      };
    }
    const scale = BABYLON.Scalar.Lerp(0.145, 0.1, point.progress) * (0.88 + random() * 0.22);
    const groundY = getRouteLandscapeHeight(
      point.x,
      point.z,
      startPosition,
      point.progress,
      point.edgeRatio,
    );
    scaling.setAll(scale);
    position.set(point.x, groundY - assetBottom * scale + GRASS_GROUND_OFFSET, point.z);
    BABYLON.Quaternion.RotationYawPitchRollToRef(random() * Math.PI * 2, 0, 0, rotation);
    BABYLON.Matrix.ComposeToRef(scaling, rotation, position, matrix);
    matrix.copyToArray(matrices, index * 16);
  }

  grass.thinInstanceSetBuffer("matrix", matrices, 16, true);
  grass.thinInstanceRefreshBoundingInfo(true);
  return { mesh: grass, count: ROUTE_GRASS_COUNT };
}

function createRouteHills(world, startPosition, route, source) {
  const layout = [
    [0.25, -1, 44, 22, 10, 16, -0.45],
    [0.48, 1, 46, 24, 11, 17, 0.72],
    [0.7, -1, 45, 21, 9.5, 15, 1.05],
    [0.9, 1, 43, 23, 10.5, 17, -0.84],
  ];
  return layout.map(([progress, side, offset, scaleX, scaleY, scaleZ, yaw], index) => {
    const frame = routeLandscapeFrame(route, progress * route.length);
    const x = frame.position.x + frame.lateral.x * offset * side;
    const z = frame.position.z + frame.lateral.z * offset * side;
    const hill = source.createInstance(`dreamy-route-hill-${index}`);
    hill.parent = world;
    hill.position.set(
      x,
      getRouteLandscapeHeight(x, z, startPosition, progress, 1) + scaleY * 0.512 - 1.2,
      z,
    );
    hill.scaling.set(scaleX, scaleY, scaleZ);
    hill.rotation.y = yaw;
    hill.isPickable = false;
    hill.receiveShadows = false;
    return hill;
  });
}

function routeLandscapeFrame(route, distance) {
  const clampedDistance = Math.min(distance, route.length);
  const progress = route.progressAtDistance(clampedDistance);
  const position = route.positionAt(progress);
  const tangent = route.tangentAt(progress);
  tangent.y = 0;
  tangent.normalize();
  if (distance > route.length) {
    position.addInPlace(tangent.scale(distance - route.length));
  }
  const lateral = new BABYLON.Vector3(tangent.z, 0, -tangent.x).normalize();
  return { position, tangent, lateral };
}

function getRouteLandscapeHeight(x, z, startPosition, progress, edgeRatio) {
  const originalBlend = 1 - smoothstep(progress / 0.24);
  const originalHeight = getMeadowHeight(x, z, startPosition);
  const routeRoll = Math.sin(x * 0.115 + z * 0.071) * 0.16
    + Math.cos(z * 0.092 - x * 0.038) * 0.1
    + Math.sin((x - z) * 0.064) * 0.05;
  const edgeLift = smoothstep((edgeRatio - 0.68) / 0.32) * 0.55;
  return BABYLON.Scalar.Lerp(routeRoll, originalHeight, originalBlend) + edgeLift;
}

function createRetreatedCameraStart(startPosition, housePosition) {
  const towardHouse = housePosition.subtract(startPosition);
  towardHouse.y = 0;
  towardHouse.normalize();
  const cameraStart = startPosition.subtract(towardHouse.scale(CAMERA_START_RETREAT));
  cameraStart.y = getMeadowHeight(cameraStart.x, cameraStart.z, startPosition);
  return cameraStart;
}

function smoothstep(value) {
  const clamped = BABYLON.Scalar.Clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function getMeadowHeight(x, z, startPosition) {
  const dx = x - startPosition.x;
  const dz = z - startPosition.z;
  const distance = Math.hypot(dx, dz);
  const fade = BABYLON.Scalar.Clamp((distance - 2.7) / 8, 0, 1);
  const broad = Math.sin(dx * 0.16 + dz * 0.045) * 0.18 + Math.cos(dz * 0.13 - dx * 0.05) * 0.12;
  const soft = Math.sin((dx - dz) * 0.11) * 0.045;
  const edgeLift = Math.max(0, distance - 42) * 0.03;
  return (broad + soft) * fade + edgeLift;
}

async function createDistantMountainLayers(scene, world, startPosition) {
  const container = await BABYLON.SceneLoader.LoadAssetContainerAsync(
    HORIZON_HILLS_ROOT,
    HORIZON_HILLS_FILE,
    scene,
  );
  container.addAllToScene();

  const source = container.meshes.find((mesh) => mesh.getTotalVertices() > 0);
  if (!source) {
    throw new Error("Hügel GLB did not contain a renderable mesh.");
  }

  container.materials.forEach((material) => {
    material.backFaceCulling = false;
    material.fogEnabled = false;
  });

  const placeHill = (hill, mesh) => {
    const [scaleX, scaleY, scaleZ] = hill.scale;
    mesh.parent = world;
    mesh.position.set(
      startPosition.x + Math.cos(hill.angle) * hill.radius,
      scaleY * 0.512 - 1.2,
      startPosition.z + Math.sin(hill.angle) * hill.radius,
    );
    mesh.scaling.set(scaleX, scaleY, scaleZ);
    mesh.rotation.y = hill.yaw;
    mesh.isPickable = false;
    mesh.receiveShadows = false;
  };

  placeHill(HORIZON_HILL_LAYOUT[0], source);
  const hills = [source];
  HORIZON_HILL_LAYOUT.slice(1).forEach((hill, index) => {
    const instance = source.createInstance(`dreamy-horizon-hill-${index + 1}`);
    placeHill(hill, instance);
    hills.push(instance);
  });
  return hills;
}

async function createDreamySky(scene, world, startPosition) {
  const container = await BABYLON.SceneLoader.LoadAssetContainerAsync(
    TOON_SKYDOME_ROOT,
    TOON_SKYDOME_FILE,
    scene,
  );
  container.addAllToScene();

  const skyRoot = container.rootNodes[0];
  const sky = container.meshes.find((mesh) => mesh.getTotalVertices() > 0);
  if (!skyRoot || !sky) {
    throw new Error("Toon Skydome did not contain a renderable sky mesh.");
  }

  // The source is a unit upper hemisphere.  This places its base at the idyll
  // ground plane and expands it well beyond the 156 m outer mountain ring.
  skyRoot.parent = world;
  skyRoot.position.copyFrom(startPosition);
  skyRoot.scaling.scaleInPlace(TOON_SKYDOME_SCALE);
  sky.isPickable = false;
  sky.infiniteDistance = false;
  sky.receiveShadows = false;
  sky.alwaysSelectAsActiveMesh = true;
  container.materials.forEach((material) => {
    material.backFaceCulling = false;
    material.disableDepthWrite = true;
    material.fogEnabled = false;
  });

  return {
    sky,
    update() {},
  };
}

async function createHouseTarget(scene, world, startPosition) {
  const container = await BABYLON.SceneLoader.LoadAssetContainerAsync(
    HOUSE_ROOT,
    HOUSE_FILE,
    scene,
  );
  container.addAllToScene();

  const house = container.meshes.find((mesh) => mesh.getTotalVertices() > 0);
  if (!house) {
    throw new Error("Haus GLB did not contain a renderable mesh.");
  }
  const houseRoot = new BABYLON.TransformNode("dreamy-idyll-house-target", scene);
  container.rootNodes.forEach((node) => {
    node.parent = houseRoot;
  });
  houseRoot.parent = world;
  houseRoot.scaling.setAll(HOUSE_SCALE);
  houseRoot.rotation.y = HOUSE_ROTATION_Y;
  houseRoot.position.set(
    startPosition.x + HOUSE_OFFSET.x,
    getMeadowHeight(startPosition.x + HOUSE_OFFSET.x, startPosition.z + HOUSE_OFFSET.z, startPosition)
      + HOUSE_SCALE * 0.47548696398735046,
    startPosition.z + HOUSE_OFFSET.z,
  );
  houseRoot.computeWorldMatrix(true);
  house.computeWorldMatrix(true);
  container.materials.forEach((material) => {
    material.backFaceCulling = false;
  });
  house.isPickable = false;
  house.receiveShadows = true;

  const bounds = house.getBoundingInfo().boundingBox;
  const localDoorPoint = new BABYLON.Vector3(
    (bounds.minimum.x + bounds.maximum.x) * 0.5,
    (bounds.minimum.y + bounds.maximum.y) * 0.5,
    bounds.maximum.z,
  );
  const doorPointWorld = BABYLON.Vector3.TransformCoordinates(localDoorPoint, house.getWorldMatrix());
  const facadeNormal = BABYLON.Vector3.TransformNormal(HOUSE_DOOR_LOCAL_NORMAL, house.getWorldMatrix())
    .normalize();
  const riftCenter = new BABYLON.Vector3(
    doorPointWorld.x + facadeNormal.x * 0.18,
    getMeadowHeight(startPosition.x + HOUSE_OFFSET.x, startPosition.z + HOUSE_OFFSET.z, startPosition),
    doorPointWorld.z + facadeNormal.z * 0.18,
  );
  const travelForward = facadeNormal.negate();
  const lateral = new BABYLON.Vector3(travelForward.z, 0, -travelForward.x);

  return {
    root: houseRoot,
    mesh: house,
    position: houseRoot.position.clone(),
    scale: HOUSE_SCALE,
    bounds,
    entrance: {
      center: riftCenter,
      forward: travelForward,
      lateral,
    },
    approachTarget: riftCenter.add(new BABYLON.Vector3(0, 1.65, 0)),
  };
}

function createDreamyLighting(scene) {
  const fill = new BABYLON.HemisphericLight("dreamy-idyll-soft-fill", new BABYLON.Vector3(0, 1, 0), scene);
  fill.intensity = 0.68;
  fill.diffuse = BABYLON.Color3.FromHexString("#e5f1f4");
  fill.groundColor = BABYLON.Color3.FromHexString("#9ab98a");
  const sun = new BABYLON.DirectionalLight("dreamy-idyll-late-afternoon-sun", new BABYLON.Vector3(-0.52, -0.72, 0.34), scene);
  sun.position = new BABYLON.Vector3(24, 32, -18);
  sun.intensity = 1.1;
  sun.diffuse = BABYLON.Color3.FromHexString("#ffe1b8");
  return [fill, sun];
}

async function loadNatureLibraries(scene, world) {
  const names = [
    "CommonTree_1", "CommonTree_2", "CommonTree_3", "CommonTree_4",
    "Grass_Common_Short",
    "Flower_3_Group", "Flower_4_Group", "Flower_4_Single", "Plant_1", "Fern_1", "Clover_1",
    "Bush_Common", "Bush_Common_Flowers",
    "Rock_Medium_1", "Rock_Medium_2", "Rock_Medium_3",
  ];
  const entries = await Promise.all(names.map(async (name) => [name, await loadLibrary(scene, world, name)]));
  return Object.fromEntries(entries);
}

async function loadLibrary(scene, world, name) {
  const container = await BABYLON.SceneLoader.LoadAssetContainerAsync(PACK_ROOT, `${name}.gltf`, scene);
  container.lights.forEach((light) => light.dispose());
  container.cameras.forEach((camera) => camera.dispose());
  container.animationGroups.forEach((group) => group.stop());
  container.addAllToScene();
  if (name.startsWith("Grass_")) {
    // The GLTF root imports with a mirrored X axis. Thin-instance matrices are
    // already authored in meadow world space, so retain the asset geometry but
    // remove that inherited coordinate-system mirror before using it as the
    // thin-instance source.
    container.rootNodes.forEach((root) => {
      root.position.set(0, 0, 0);
      root.scaling.set(1, 1, 1);
      root.rotation.set(0, 0, 0);
      root.rotationQuaternion = null;
    });
  }
  container.rootNodes.forEach((root) => { root.parent = world; });
  const meshes = container.meshes.filter((mesh) => mesh.getTotalVertices() > 0);
  meshes.forEach((mesh) => {
    if (name.startsWith("Grass_")) {
      // The pack's palette texture is intended for Unity's vertex-color
      // shader. Babylon otherwise exposes its black palette entries, so keep
      // the authored blade geometry and give both grass variants one clean,
      // shared stylized green material instead.
      const grassMaterial = new BABYLON.StandardMaterial(`dreamy-${name}-material`, scene);
      grassMaterial.diffuseColor = BABYLON.Color3.FromHexString("#285e2d");
      grassMaterial.emissiveColor = BABYLON.Color3.FromHexString("#0a2410");
      grassMaterial.specularColor = BABYLON.Color3.Black();
      grassMaterial.useVertexColor = false;
      grassMaterial.backFaceCulling = false;
      mesh.material = grassMaterial;
      // These assets also carry a Unity palette in COLOR_0.  Removing that
      // unused palette prevents its black swatch from tinting Babylon blades.
      mesh.removeVerticesData(BABYLON.VertexBuffer.ColorKind);
    }
    mesh.isVisible = false;
    mesh.isPickable = false;
    mesh.receiveShadows = false;
  });
  return { meshes };
}

function placeNature(scene, world, libraries, startPosition, house, meadow) {
  const random = createRandom(7391);
  const swayAnchors = [];
  const entries = [];
  const counts = { grass: 0, trees: 0, flowers: 0, plants: 0, bushes: 0, rocks: 0 };
  const add = (library, name, placement, kind) => {
    const anchor = createInstanceGroup(scene, world, library, name, placement, startPosition);
    entries.push({ anchor, prefix: name, kind });
    counts[kind] += 1;
    if (kind === "flowers" || kind === "plants" || kind === "bushes" || kind === "grass") {
      swayAnchors.push({ anchor, phase: random() * Math.PI * 2, kind });
    }
  };

  const treePlacements = [
    ["CommonTree_1", -18, -5, 1.36, 0.4], ["CommonTree_2", 13, 7, 1.2, 5.4],
    ["CommonTree_3", 19, 6, 1.45, 3.9], ["CommonTree_4", -22, 16, 1.18, 0.9],
    ["CommonTree_1", -23, 8, 1.12, 4.1], ["CommonTree_2", 4, 23, 1.28, 2.3],
    ["CommonTree_3", 23, -3, 1.1, 1.7], ["CommonTree_4", -4, -27, 1.05, 5.6],
  ];
  treePlacements.forEach(([library, x, z, scale, rotation], index) => {
    add(libraries[library], `dreamy-tree-${index}`, { x: startPosition.x + x, z: startPosition.z + z, scale, rotation }, "trees");
  });

  const middleTreePlacements = [
    ["CommonTree_1", -34, -14, 0.86, 1.1], ["CommonTree_2", -42, 4, 0.9, 4.2],
    ["CommonTree_3", -31, 28, 0.78, 2.7], ["CommonTree_4", -12, 43, 0.92, 5.1],
    ["CommonTree_1", 17, 39, 0.82, 0.5], ["CommonTree_2", 39, 23, 0.9, 3.6],
    ["CommonTree_3", 45, -8, 0.76, 1.8], ["CommonTree_4", 31, -32, 0.86, 4.8],
    ["CommonTree_1", 4, -46, 0.78, 2.1], ["CommonTree_2", -27, -37, 0.83, 5.7],
  ];
  middleTreePlacements.forEach(([library, x, z, scale, rotation], index) => {
    add(libraries[library], `dreamy-middle-tree-${index}`, { x: startPosition.x + x, z: startPosition.z + z, scale, rotation }, "trees");
  });

  const flowerPlacements = [
    ["Flower_3_Group", -2.6, -1.8, 1.0, 0.4], ["Flower_4_Group", 2.8, -2.2, 0.92, 2.1],
    ["Flower_3_Group", -5.2, 2.7, 0.88, 5.0], ["Flower_4_Single", 4.2, 2.2, 1.15, 1.4],
    ["Flower_4_Group", 6.4, 5.2, 0.8, 0.7], ["Flower_3_Group", -7.2, -4.5, 0.76, 3.7],
    ["Flower_4_Single", -1.0, 6.0, 1.04, 5.4], ["Flower_4_Group", 8.0, -4.6, 0.72, 2.7],
    ["Flower_3_Group", 1.3, -7.2, 0.86, 4.1], ["Flower_4_Group", -8.4, 1.2, 0.78, 1.8],
    ["Flower_4_Single", 6.6, 7.4, 1.05, 3.1], ["Flower_3_Group", -3.6, 9.1, 0.72, 5.8],
  ];
  flowerPlacements.forEach(([library, x, z, scale, rotation], index) => {
    add(libraries[library], `dreamy-flower-${index}`, { x: startPosition.x + x, z: startPosition.z + z, scale, rotation }, "flowers");
  });

  const plantPlacements = [
    ["Plant_1", -9, -7, 1.0, 1.6], ["Fern_1", 9, -7, 1.15, 4.2], ["Clover_1", -5, 7, 1.18, 0.6],
    ["Plant_1", 11, 3, 0.94, 2.9], ["Fern_1", -12, 4, 0.9, 5.1], ["Clover_1", 5, 9, 1.15, 3.5],
  ];
  plantPlacements.forEach(([library, x, z, scale, rotation], index) => {
    add(libraries[library], `dreamy-plant-${index}`, { x: startPosition.x + x, z: startPosition.z + z, scale, rotation }, "plants");
  });

  const bushPlacements = [
    ["Bush_Common", -15, -11, 1.15, 0.8], ["Bush_Common_Flowers", 15, 11, 1.1, 2.5],
    ["Bush_Common", -20, 2, 1.28, 4.2], ["Bush_Common_Flowers", 18, -9, 1.0, 5.4],
    ["Bush_Common", 4, 20, 1.18, 1.7], ["Bush_Common_Flowers", -9, 19, 1.0, 3.0],
  ];
  bushPlacements.forEach(([library, x, z, scale, rotation], index) => {
    add(libraries[library], `dreamy-bush-${index}`, { x: startPosition.x + x, z: startPosition.z + z, scale, rotation }, "bushes");
  });

  const rockPlacements = [
    ["Rock_Medium_1", -7.8, -3.0, 0.88, 1.1], ["Rock_Medium_2", 7.3, 6.1, 0.76, 3.6],
    ["Rock_Medium_3", -12.6, 9.3, 0.92, 5.0], ["Rock_Medium_1", 13.8, -6.1, 0.7, 0.4],
    ["Rock_Medium_2", 2.5, 15.3, 0.72, 2.2], ["Rock_Medium_3", -18.2, -5.1, 0.78, 4.4],
  ];
  rockPlacements.forEach(([library, x, z, scale, rotation], index) => {
    add(libraries[library], `dreamy-rock-${index}`, { x: startPosition.x + x, z: startPosition.z + z, scale, rotation, yOffset: -0.14 }, "rocks");
  });

  // Grass is generated only after every house and nature prop has been
  // instantiated, so its surface samples and occupancy checks use final data.
  const grassExclusions = createGrassExclusions(house, entries);
  const buildGrass = () => {
    counts.grass = createDenseGrassField(
      libraries.Grass_Common_Short,
      meadow,
      startPosition,
      random,
      DENSE_GRASS_ZONES,
      GRASS_SCALE_RANGE,
      grassExclusions,
    );
    return counts.grass;
  };
  return { counts, swayAnchors, entries, buildGrass };
}

function createInstanceGroup(scene, world, library, name, placement, startPosition) {
  const anchor = new BABYLON.TransformNode(`${name}-anchor`, scene);
  anchor.parent = world;
  anchor.position.set(
    placement.x,
    (placement.groundY ?? getMeadowHeight(placement.x, placement.z, startPosition)) + (placement.yOffset ?? 0),
    placement.z,
  );
  anchor.rotation.y = placement.rotation;
  anchor.scaling.setAll(placement.scale);
  library.meshes.forEach((mesh, index) => {
    const instance = mesh.createInstance(`${name}-part-${index}`);
    instance.parent = anchor;
    instance.isPickable = false;
    instance.receiveShadows = false;
  });
  return anchor;
}

function createDenseGrassField(library, meadow, startPosition, random, zones, scaleRange, exclusions) {
  const mesh = library.meshes[0];
  // The asset's origin sits slightly above its lowest vertices.  Use its real
  // local bound, rather than a guessed offset, so every instance meets the
  // same height function that generated the meadow beneath it.
  const assetBottom = mesh.getBoundingInfo().boundingBox.minimum.y;
  const sampler = createMeadowSurfaceSampler(meadow);
  return createThinInstanceField(mesh, sampler, startPosition, random, zones, scaleRange, assetBottom, exclusions);
}

function createThinInstanceField(mesh, sampler, startPosition, random, zones, scaleRange, assetBottom, exclusions) {
  const count = zones.reduce((total, zone) => total + zone.count, 0);
  const matrices = new Float32Array(count * 16);
  const scaling = new BABYLON.Vector3();
  const position = new BABYLON.Vector3();
  const rotation = new BABYLON.Quaternion();
  const matrix = BABYLON.Matrix.Identity();
  let index = 0;

  zones.forEach((zone) => {
    for (let zoneIndex = 0; zoneIndex < zone.count; zoneIndex += 1) {
      const hit = randomMeadowSurfacePoint(random, sampler, zone, startPosition, exclusions);
      const scale = BABYLON.Scalar.Lerp(scaleRange[0], scaleRange[1], random());
      scaling.setAll(scale);
      position.set(
        hit.point.x + hit.normal.x * GRASS_GROUND_OFFSET,
        hit.point.y - assetBottom * scale + hit.normal.y * GRASS_GROUND_OFFSET,
        hit.point.z + hit.normal.z * GRASS_GROUND_OFFSET,
      );
      BABYLON.Quaternion.RotationYawPitchRollToRef(random() * Math.PI * 2, 0, 0, rotation);
      BABYLON.Matrix.ComposeToRef(scaling, rotation, position, matrix);
      matrix.copyToArray(matrices, index * 16);
      index += 1;
    }
  });

  mesh.isVisible = true;
  mesh.thinInstanceSetBuffer("matrix", matrices, 16, true);
  mesh.thinInstanceRefreshBoundingInfo(true);
  mesh.isPickable = false;
  mesh.receiveShadows = false;
  return count;
}

function createGrassExclusions(house, entries) {
  const exclusions = [
    createMeshFootprintExclusion([house.mesh], "house-foundation", 0.4, 0.32),
    createFrontYardExclusion(house.entrance),
    {
      type: "circle",
      x: house.entrance.center.x,
      z: house.entrance.center.z,
      radius: RIFT_GRASS_EXCLUSION_RADIUS,
      label: "house-door-and-rift",
    },
  ];

  entries.forEach(({ anchor, kind, prefix }) => {
    // Only the lower geometry defines a footprint.  This keeps grass right
    // up to objects while excluding their actual grounded contour rather than
    // creating an empty rectangle from a roof or a tree crown.
    const [groundBand, margin] = kind === "trees"
      ? [0.26, 0.15]
      : kind === "rocks"
        ? [0.3, 0.13]
        : kind === "bushes"
          ? [0.18, 0.08]
          : [0.12, 0.04];
    exclusions.push(createMeshFootprintExclusion(anchor.getChildMeshes(false), prefix, groundBand, margin));
  });

  return exclusions.filter(Boolean);
}

function createFrontYardExclusion(entrance) {
  const outward = entrance.forward.negate();
  const makePoint = (forwardDistance, lateralDistance) => {
    const point = entrance.center
      .add(outward.scale(forwardDistance))
      .add(entrance.lateral.scale(lateralDistance));
    return { x: point.x, z: point.z };
  };
  // This is a door-aligned forecourt, not an enlarged house bound: it keeps
  // the porch, Rift, and immediate access clear while meadow resumes at the edge.
  return {
    type: "footprint",
    outline: [
      makePoint(-0.08, -1.65),
      makePoint(-0.08, 1.65),
      makePoint(3.0, 2.0),
      makePoint(3.0, -2.0),
    ],
    margin: 0.05,
    label: "house-front-yard",
  };
}

function createMeshFootprintExclusion(meshes, label, groundBand, margin) {
  const renderedMeshes = meshes.filter((mesh) => mesh.getTotalVertices() > 0);
  if (renderedMeshes.length === 0) return null;

  renderedMeshes.forEach((mesh) => mesh.computeWorldMatrix(true));
  const groundY = Math.min(...renderedMeshes.map((mesh) => mesh.getBoundingInfo().boundingBox.minimumWorld.y));
  const points = [];
  renderedMeshes.forEach((mesh) => {
    const positions = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    if (!positions) return;
    const worldMatrix = mesh.getWorldMatrix();
    for (let index = 0; index < positions.length; index += 3) {
      const worldPoint = BABYLON.Vector3.TransformCoordinates(
        BABYLON.TmpVectors.Vector3[0].set(positions[index], positions[index + 1], positions[index + 2]),
        worldMatrix,
      );
      if (worldPoint.y <= groundY + groundBand) points.push({ x: worldPoint.x, z: worldPoint.z });
    }
  });

  const outline = createConvexHull(points);
  if (outline.length < 3) return null;
  return { type: "footprint", outline, margin, label };
}

function createConvexHull(points) {
  const unique = [...new Map(points.map((point) => [`${point.x.toFixed(4)}:${point.z.toFixed(4)}`, point])).values()];
  if (unique.length < 3) return unique;
  unique.sort((a, b) => a.x - b.x || a.z - b.z);
  const cross = (origin, first, second) => (first.x - origin.x) * (second.z - origin.z)
    - (first.z - origin.z) * (second.x - origin.x);
  const lower = [];
  unique.forEach((point) => {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), point) <= 0) lower.pop();
    lower.push(point);
  });
  const upper = [];
  [...unique].reverse().forEach((point) => {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), point) <= 0) upper.pop();
    upper.push(point);
  });
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function createAtmosphere(scene, world, startPosition, swayAnchors, sky) {
  const pollenTemplate = BABYLON.MeshBuilder.CreateSphere("dreamy-pollen-template", { diameter: 0.045, segments: 4 }, scene);
  pollenTemplate.parent = world;
  pollenTemplate.isVisible = false;
  pollenTemplate.isPickable = false;
  const material = new BABYLON.StandardMaterial("dreamy-pollen-material", scene);
  material.emissiveColor = BABYLON.Color3.FromHexString("#fff3c9");
  material.alpha = 0.56;
  pollenTemplate.material = material;
  const random = createRandom(991);
  const pollen = Array.from({ length: POLLEN_COUNT }, (_, index) => {
    const point = randomPoint(random, 1, 15);
    const instance = pollenTemplate.createInstance(`dreamy-pollen-${index}`);
    instance.parent = world;
    instance.isPickable = false;
    return { instance, x: startPosition.x + point.x, z: startPosition.z + point.z, y: 0.75 + random() * 2.5, phase: random() * Math.PI * 2 };
  });
  let elapsed = 0;
  let previousFrameTime = performance.now();
  const observer = scene.onBeforeRenderObservable.add(() => {
    const now = performance.now();
    elapsed += Math.min((now - previousFrameTime) / 1000, 0.04);
    previousFrameTime = now;
    pollen.forEach((state) => {
      state.instance.position.set(state.x + Math.sin(elapsed * 0.15 + state.phase) * 0.48, state.y + Math.sin(elapsed * 0.31 + state.phase) * 0.16, state.z + Math.cos(elapsed * 0.12 + state.phase) * 0.4);
    });
    swayAnchors.forEach((state) => {
      const rate = state.kind === "grass" ? 0.56 : 0.24;
      const amplitude = state.kind === "bushes" ? 0.008 : state.kind === "grass" ? 0.022 : 0.014;
      state.anchor.rotation.z = Math.sin(elapsed * rate + state.phase) * amplitude;
      state.anchor.rotation.x = Math.sin(elapsed * rate * 0.73 + state.phase * 1.7) * amplitude * 0.55;
    });
    sky.update(elapsed);
  });
  return { dispose: () => scene.onBeforeRenderObservable.remove(observer) };
}

function randomPoint(random, inner, outer) {
  const radius = Math.sqrt(random() * (outer * outer - inner * inner) + inner * inner);
  const angle = random() * Math.PI * 2;
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
}

function createMeadowSurfaceSampler(meadow) {
  const positions = meadow.getVerticesData(BABYLON.VertexBuffer.PositionKind);
  const indices = meadow.getIndices();
  if (!positions || !indices) {
    throw new Error("The grass receiver has no readable surface geometry.");
  }

  meadow.computeWorldMatrix(true);
  const worldMatrix = meadow.getWorldMatrix();
  const triangles = [];
  let totalArea = 0;
  for (let index = 0; index < indices.length; index += 3) {
    const first = readWorldVertex(positions, indices[index], worldMatrix);
    const second = readWorldVertex(positions, indices[index + 1], worldMatrix);
    const third = readWorldVertex(positions, indices[index + 2], worldMatrix);
    const normal = BABYLON.Vector3.Cross(second.subtract(first), third.subtract(first));
    const doubleArea = normal.length();
    if (doubleArea === 0) continue;
    normal.scaleInPlace(1 / doubleArea);
    // Meadow indices are wound for inside-out rendering.  Grass grows on the
    // physical upward surface, so orient the sampled normal accordingly.
    if (normal.y < 0) normal.scaleInPlace(-1);
    if (normal.y < MIN_GRASS_GROUND_NORMAL_Y) continue;
    totalArea += doubleArea * 0.5;
    triangles.push({ first, second, third, normal, cumulativeArea: totalArea });
  }
  if (triangles.length === 0) {
    throw new Error("The grass receiver has no valid upward-facing triangles.");
  }

  return {
    sample(random) {
      const targetArea = random() * totalArea;
      let low = 0;
      let high = triangles.length - 1;
      while (low < high) {
        const middle = Math.floor((low + high) * 0.5);
        if (triangles[middle].cumulativeArea < targetArea) low = middle + 1;
        else high = middle;
      }
      const triangle = triangles[low];
      const root = Math.sqrt(random());
      const firstWeight = 1 - root;
      const secondWeight = root * (1 - random());
      const thirdWeight = 1 - firstWeight - secondWeight;
      return {
        point: triangle.first.scale(firstWeight)
          .add(triangle.second.scale(secondWeight))
          .add(triangle.third.scale(thirdWeight)),
        normal: triangle.normal,
      };
    },
  };
}

function readWorldVertex(positions, index, worldMatrix) {
  const offset = index * 3;
  return BABYLON.Vector3.TransformCoordinates(
    new BABYLON.Vector3(positions[offset], positions[offset + 1], positions[offset + 2]),
    worldMatrix,
  );
}

function randomMeadowSurfacePoint(random, sampler, zone, startPosition, exclusions) {
  const entrance = {
    x: HOUSE_OFFSET.x,
    z: HOUSE_OFFSET.z - HOUSE_SCALE * 0.7114279866218567,
  };
  for (let attempt = 0; attempt < 512; attempt += 1) {
    const hit = sampler.sample(random);
    const point = {
      x: hit.point.x - startPosition.x,
      z: hit.point.z - startPosition.z,
    };
    const distance = Math.hypot(point.x, point.z);
    if (
      distance >= zone.innerRadius
      && distance <= zone.outerRadius
      && distanceToSegment(point, { x: 0, z: 0 }, entrance) >= HOUSE_PATH_GRASS_CLEARANCE
      && Math.hypot(point.x - entrance.x, point.z - entrance.z) >= HOUSE_ENTRANCE_CLEARANCE
      && !isInsideGrassExclusion(startPosition.x + point.x, startPosition.z + point.z, exclusions)
    ) {
      return hit;
    }
  }
  throw new Error("Unable to place a grass instance outside its protected scene zones.");
}

function isInsideGrassExclusion(x, z, exclusions) {
  return exclusions.some((zone) => {
    if (zone.type === "circle") {
      return Math.hypot(x - zone.x, z - zone.z) <= zone.radius;
    }
    return isInsideFootprint(x, z, zone);
  });
}

function isInsideFootprint(x, z, zone) {
  let inside = false;
  for (let index = 0, previous = zone.outline.length - 1; index < zone.outline.length; previous = index, index += 1) {
    const current = zone.outline[index];
    const prior = zone.outline[previous];
    if ((current.z > z) !== (prior.z > z) && x < (prior.x - current.x) * (z - current.z) / (prior.z - current.z) + current.x) {
      inside = !inside;
    }
    if (distanceToSegment({ x, z }, prior, current) <= zone.margin) return true;
  }
  return inside;
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  const t = BABYLON.Scalar.Clamp(((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared, 0, 1);
  return Math.hypot(point.x - (start.x + dx * t), point.z - (start.z + dz * t));
}

function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
