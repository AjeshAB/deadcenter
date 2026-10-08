import * as THREE from "three";
import { VERTICAL_FOV } from "../input/sens";
import type { Settings } from "../settings/store";
import type { Scenario } from "../scenario/schema";
import { ScenarioRunner } from "../scenario/runner";
import { findScenario } from "../scenario/catalog";
export function createWorld(host: HTMLElement, settings: Settings) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor("#171c1b");
  host.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog("#171c1b", 16, 44);
  const camera = new THREE.PerspectiveCamera(VERTICAL_FOV, 1, 0.1, 100);
  camera.position.set(0, 2.5, 8);
  camera.rotation.order = "YXZ";
  scene.add(new THREE.HemisphereLight("#efffdc", "#26322b", 2.2));
  const light = new THREE.DirectionalLight("#efffd9", 3);
  light.position.set(-5, 10, 8);
  scene.add(light);
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(32, 16, 0.2),
    new THREE.MeshStandardMaterial({ color: "#333d38", roughness: 0.95 }),
  );
  wall.position.set(0, 4, -8);
  scene.add(wall);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 70),
    new THREE.MeshStandardMaterial({ color: "#1e2622", roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const grid = new THREE.GridHelper(70, 35, "#58634e", "#303b32");
  grid.position.y = 0.01;
  scene.add(grid);
  const lines = new THREE.Group();
  const lineMat = new THREE.LineBasicMaterial({
    color: "#465047",
    transparent: true,
    opacity: 0.45,
  });
  for (let x = -16; x <= 16; x += 2)
    lines.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(x, 0, -7.88),
          new THREE.Vector3(x, 12, -7.88),
        ]),
        lineMat,
      ),
    );
  for (let y = 0; y <= 12; y += 2)
    lines.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-16, y, -7.88),
          new THREE.Vector3(16, y, -7.88),
        ]),
        lineMat,
      ),
    );
  scene.add(lines);
  const stripMat = new THREE.MeshBasicMaterial({ color: "#c3dca1" });
  for (const x of [-12, 12]) {
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(0.055, 9, 0.02),
      stripMat,
    );
    strip.position.set(x, 4.5, -7.85);
    scene.add(strip);
  }
  let scenario = findScenario("builtin/dot-wall");
  let seed = crypto.getRandomValues(new Uint32Array(1))[0];
  let runner = new ScenarioRunner(scenario, scene, camera, settings, seed);
  function configure(next: Scenario, nextSeed = seed) {
    runner.dispose();
    scenario = next;
    seed = nextSeed;
    wall.visible = lines.visible = scenario.category === "wall";
    runner = new ScenarioRunner(scenario, scene, camera, settings, seed);
  }
  function update() {
    configure(scenario);
  }
  const gunScene = new THREE.Scene();
  const gunCamera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
  gunScene.add(new THREE.HemisphereLight("#ffffff", "#334039", 3));
  const gun = new THREE.Group();
  gun.position.set(0.32, -0.29, -0.65);
  gun.rotation.y = -0.08;
  const gunMat = new THREE.MeshStandardMaterial({
    color: "#343e3d",
    metalness: 0.65,
    roughness: 0.4,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.13, 0.42), gunMat);
  gun.add(body);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.22, 0.12), gunMat);
  grip.position.set(0, -0.12, 0.12);
  grip.rotation.x = -0.2;
  gun.add(grip);
  const sight = new THREE.Mesh(
    new THREE.BoxGeometry(0.025, 0.025, 0.06),
    new THREE.MeshBasicMaterial({ color: "#d5f875" }),
  );
  sight.position.set(0, 0.075, -0.13);
  gun.add(sight);
  const flash = new THREE.Mesh(
    new THREE.ConeGeometry(0.065, 0.18, 5),
    new THREE.MeshBasicMaterial({ color: "#ffecab" }),
  );
  flash.rotation.x = -Math.PI / 2;
  flash.position.z = -0.29;
  flash.visible = false;
  gun.add(flash);
  gunScene.add(gun);
  let kick = 0;
  function shoot() {
    const hit = runner.click();
    if (hit !== null) kick = 1;
    return hit;
  }
  const resize = () => {
    const { width, height } = host.getBoundingClientRect();
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    gunCamera.aspect = width / height;
    gunCamera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(host);
  resize();
  return {
    camera,
    get runner() {
      return runner;
    },
    configure,
    update,
    shoot,
    reset() {
      configure(scenario, seed);
    },
    render(dt: number, playing: boolean) {
      kick = Math.max(0, kick - dt * 7);
      gun.position.z = -0.65 + kick * 0.08;
      gun.rotation.x = kick * 0.14;
      flash.visible = kick > 0.7;
      renderer.autoClear = true;
      renderer.render(scene, camera);
      if (playing && settings.gun) {
        renderer.autoClear = false;
        renderer.clearDepth();
        renderer.render(gunScene, gunCamera);
      }
    },
  };
}
