import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  Color,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Raycaster,
  Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  SpotLight,
  Vector2,
  WebGLRenderer,
} from "https://unpkg.com/three@0.160.0/build/three.module.js?module";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js?module";

const COLUMN_DATA = [
  ["PARAICO", "DE JOSE", "DIAZ", "BONSATO"],
  ["CADIZ", "DAYAWON", "BALANE"],
  ["SALAO", "CAMACHO", "MANANSALA", "FORTEZ", "MAGNAYE", "MERABONA", "BERNARDO"],
  ["RIVERA", "CABELLO", "MULAT", "ANSAL", "ABIT", "BAUTISTA"],
];

const STATUS_SEQUENCE = ["unmarked", "present", "absent"];
const STATUS_COLORS = {
  unmarked: 0xd2d7e4,
  present: 0x3ab97a,
  absent: 0xf45b69,
};
const STORAGE_PREFIX = "attendance-map::";

const dateInput = document.getElementById("attendance-date");
const resetBtn = document.getElementById("reset-btn");
const exportBtn = document.getElementById("export-btn");

let currentDateKey = null;
let attendanceState = {};

let scene;
let camera;
let renderer;
let controls;
let raycaster;
let pointer;
let hoveredSeatMesh = null;
let sceneInitialized = false;

const seatRefs = new Map(); // seatId -> { root: Group, colorMeshes: Mesh[] }

const todayISO = () => new Date().toISOString().split("T")[0];

const storageKeyForDate = (dateKey) => `${STORAGE_PREFIX}${dateKey}`;

const loadStateForDate = (dateKey) => {
  const raw = localStorage.getItem(storageKeyForDate(dateKey));
  return raw ? JSON.parse(raw) : {};
};

const saveStateForDate = () => {
  localStorage.setItem(storageKeyForDate(currentDateKey), JSON.stringify(attendanceState));
};

const nextStatus = (current = "unmarked") => {
  const idx = STATUS_SEQUENCE.indexOf(current);
  return STATUS_SEQUENCE[(idx + 1) % STATUS_SEQUENCE.length];
};

const applySeatStatus = (seatId, status) => {
  attendanceState[seatId] = status;
  const seatRef = seatRefs.get(seatId);
  if (seatRef) {
    seatRef.colorMeshes.forEach((mesh) => mesh.material.color.setHex(STATUS_COLORS[status]));
  }
  saveStateForDate();
};

const createLabelTexture = (text) => {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#1f2440";
  ctx.font = "bold 62px 'Inter', 'Segoe UI', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
};

const buildScene = () => {
  scene = new Scene();
  scene.background = new Color(0x0f1117);

  const canvas = document.getElementById("scene");
  renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  resizeRenderer();

  const aspect = canvas.clientWidth / canvas.clientHeight;
  camera = new PerspectiveCamera(48, aspect, 0.1, 500);
  camera.position.set(0, 60, 70);
  camera.lookAt(0, 0, 0);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minPolarAngle = Math.PI / 4;
  controls.maxPolarAngle = Math.PI / 2.05;
  controls.minDistance = 50;
  controls.maxDistance = 150;

  buildLights();
  buildFloor();
  buildWalls();
  buildTeacherTable();
  buildWhiteboard();
  buildDesksAndChairs();

  raycaster = new Raycaster();
  pointer = new Vector2();

  window.addEventListener("resize", resizeRenderer);
  renderer.domElement.addEventListener("pointermove", handlePointerMove);
  renderer.domElement.addEventListener("pointerdown", handlePointerDown);

  animate();
  sceneInitialized = true;
};

const buildLights = () => {
  const ambient = new AmbientLight(0xf2f4ff, 0.5);
  scene.add(ambient);

  const hemi = new HemisphereLight(0xffffff, 0x1a1c24, 0.45);
  hemi.position.set(0, 50, 0);
  scene.add(hemi);

  const overhead = new PointLight(0xffffff, 0.5, 250, 2);
  overhead.position.set(0, 60, 0);
  scene.add(overhead);

  const teacherSpot = new SpotLight(0xfff2d0, 0.35, 160, Math.PI / 6, 0.4, 1.2);
  teacherSpot.position.set(-30, 45, -20);
  teacherSpot.target.position.set(-25, 5, -30);
  scene.add(teacherSpot);
  scene.add(teacherSpot.target);

  const centerSpot = new SpotLight(0xbdd9ff, 0.3, 200, Math.PI / 5, 0.3, 1);
  centerSpot.position.set(0, 40, -10);
  centerSpot.target.position.set(0, 0, -20);
  scene.add(centerSpot);
  scene.add(centerSpot.target);
};

const buildFloor = () => {
  const floorGeometry = new PlaneGeometry(90, 110);
  const floorMaterial = new MeshStandardMaterial({
    color: 0x4a4d57,
    roughness: 0.85,
  });
  const floor = new Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  scene.add(floor);
};

const buildWalls = () => {
  const wallMaterial = new MeshStandardMaterial({ color: 0xf2f1eb, roughness: 0.9 });
  const thickness = 1;
  const height = 16;
  const width = 90;
  const depth = 110;

  const backWall = new Mesh(new BoxGeometry(width, height, thickness), wallMaterial);
  backWall.position.set(0, height / 2, -depth / 2);
  scene.add(backWall);

  const frontWall = new Mesh(new BoxGeometry(width, height, thickness), wallMaterial);
  frontWall.position.set(0, height / 2, depth / 2);
  scene.add(frontWall);

  const sideMaterial = new MeshStandardMaterial({ color: 0xe4e2d6, roughness: 0.85 });
  const sideGeo = new BoxGeometry(thickness, height, depth);
  const leftWall = new Mesh(sideGeo, sideMaterial);
  leftWall.position.set(-width / 2, height / 2, 0);
  scene.add(leftWall);

  const rightWall = leftWall.clone();
  rightWall.position.set(width / 2, height / 2, 0);
  scene.add(rightWall);
  addDoorAt({ x: width / 2 - 0.3, y: 6, z: 35 }, { x: 0, y: -Math.PI / 2, z: 0 });

  const trimMaterial = new MeshStandardMaterial({ color: 0xd0cab8, roughness: 0.75 });
  const trim = new Mesh(new BoxGeometry(width + 4, 0.6, thickness + 4), trimMaterial);
  trim.position.set(0, 0.3, -depth / 2 + 0.5);
  scene.add(trim);
};

const addDoorAt = (position, rotation) => {
  const doorMaterial = new MeshStandardMaterial({ color: 0xc9c2ad, roughness: 0.6 });
  const door = new Mesh(new BoxGeometry(10, 12, 0.6), doorMaterial);
  door.position.set(position.x, position.y, position.z);
  door.rotation.set(rotation.x, rotation.y, rotation.z);
  scene.add(door);

  const frameMaterial = new MeshStandardMaterial({ color: 0xa89566, roughness: 0.5 });
  const frame = new Mesh(new BoxGeometry(10.5, 12.5, 0.8), frameMaterial);
  frame.position.copy(door.position);
  frame.rotation.copy(door.rotation);
  scene.add(frame);
};
const buildWhiteboard = () => {
  const boardGeometry = new BoxGeometry(36, 12, 0.5);
  const boardMaterial = new MeshStandardMaterial({
    color: 0xf8f8fb,
    roughness: 0.1,
  });
  const board = new Mesh(boardGeometry, boardMaterial);
  board.position.set(0, 8, -40);
  scene.add(board);

  const tray = new Mesh(new BoxGeometry(36, 0.6, 1.2), new MeshStandardMaterial({ color: 0x3a3d4a }));
  tray.position.set(0, 2.5, -39.3);
  scene.add(tray);
};

const buildTeacherTable = () => {
  const group = new Group();
  group.position.set(-28, 0, -30);
  scene.add(group);

  const tableMaterial = new MeshStandardMaterial({ color: 0xd7ab72, roughness: 0.5 });
  const tabletop = new Mesh(new BoxGeometry(14, 1, 10), tableMaterial);
  tabletop.position.set(0, 2.2, 0);
  group.add(tabletop);

  const legsMaterial = new MeshStandardMaterial({ color: 0x2f2720, roughness: 0.7 });
  const deskLegGeo = new BoxGeometry(1, 4, 1);
  [
    [-5.5, 0.5, -4],
    [5.5, 0.5, -4],
    [-5.5, 0.5, 4],
    [5.5, 0.5, 4],
  ].forEach(([x, y, z]) => {
    const leg = new Mesh(deskLegGeo, legsMaterial);
    leg.position.set(x, y, z);
    group.add(leg);
  });

  const monitor = new Mesh(
    new BoxGeometry(4, 3, 0.5),
    new MeshStandardMaterial({ color: 0xdcd6f7, emissive: 0x5f6ac4, emissiveIntensity: 0.3 })
  );
  monitor.position.set(0, 4, -2);
  group.add(monitor);

  const stand = new Mesh(new BoxGeometry(0.6, 2, 0.6), new MeshStandardMaterial({ color: 0x2f3242, roughness: 0.5 }));
  stand.position.set(0, 3, -1.5);
  group.add(stand);

};

const buildDesksAndChairs = () => {
  seatRefs.clear();
  const columnX = [-30, -4, 4, 30];
  const seatSpacing = 8;

  COLUMN_DATA.forEach((students, colIdx) => {
    const x = columnX[colIdx];
    const tableLength = students.length * seatSpacing + 4;
    const tableMaterial = new MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.4 });
    const deskWidth = 12 * 0.5;
    const table = new Mesh(new BoxGeometry(deskWidth, 1.2, tableLength), tableMaterial);
    table.position.set(x, 3, 0);
    scene.add(table);

    const startZ = -((students.length - 1) * seatSpacing) / 2;

    students.forEach((student, rowIdx) => {
      const seatId = `c${colIdx}-${student}`;
      const status = attendanceState[seatId] || "unmarked";
      const z = startZ + rowIdx * seatSpacing;
      const cluster = new Group();
      cluster.position.set(x, 0, z);
      cluster.userData = { seatId, student };

      const rotation =
        colIdx === 0 ? Math.PI / 2 : colIdx === 3 ? -Math.PI / 2 : colIdx < 2 ? -Math.PI / 2 : Math.PI / 2;
      const offset = colIdx === 0 ? 4 : colIdx === 3 ? -4 : colIdx < 2 ? -4 : 4;
      const monitorFlip = Math.PI; // flip screens toward chairs
      const { chairGroup, colorMeshes } = createChairAndMonitor(status, rotation, offset, monitorFlip);
      cluster.add(chairGroup);

      scene.add(cluster);

      const labelTexture = createLabelTexture(student);
      const labelMaterial = new SpriteMaterial({ map: labelTexture });
      const label = new Sprite(labelMaterial);
      label.scale.set(9, 2, 1);
      label.position.set(cluster.position.x, cluster.position.y + 7.5, cluster.position.z);
      scene.add(label);

      seatRefs.set(seatId, { root: cluster, colorMeshes });
    });
  });
};

const createChairAndMonitor = (status, rotation, offset, monitorRotation = 0) => {
  const chairGroup = new Group();
  chairGroup.position.set(offset, 0, 0);
  chairGroup.rotation.y = rotation;

  const colorMaterial = new MeshStandardMaterial({
    color: STATUS_COLORS[status],
    roughness: 0.35,
    metalness: 0.05,
  });
  const frameMaterial = new MeshStandardMaterial({ color: 0x2b2f3b, roughness: 0.4 });

  const seat = new Mesh(new BoxGeometry(5, 1, 4), colorMaterial);
  seat.position.set(0, 2.2, 3);
  chairGroup.add(seat);

  const back = new Mesh(new BoxGeometry(5, 4, 0.8), colorMaterial);
  back.position.set(0, 4.2, 5);
  chairGroup.add(back);

  const base = new Mesh(new BoxGeometry(6, 0.3, 4.5), colorMaterial);
  base.position.set(0, 1.5, 3);
  chairGroup.add(base);

  const legGeo = new BoxGeometry(0.5, 2, 0.5);
  [
    [-2, 1, 2],
    [2, 1, 2],
    [-2, 1, 4],
    [2, 1, 4],
  ].forEach(([x, y, z]) => {
    const leg = new Mesh(legGeo, frameMaterial);
    leg.position.set(x, y, z);
    chairGroup.add(leg);
  });

  const monitor = new Mesh(
    new BoxGeometry(3.2, 2.2, 0.3),
    new MeshStandardMaterial({ color: 0xdcd6f7, emissive: 0x5f6ac4, emissiveIntensity: 0.25 })
  );
  monitor.position.set(0, 5, -2.5);
  monitor.rotation.y = monitorRotation;
  chairGroup.add(monitor);

  const stand = new Mesh(new BoxGeometry(0.4, 1.4, 0.4), frameMaterial);
  stand.position.set(0, 4.1, -2.8);
  stand.rotation.y = monitorRotation;
  chairGroup.add(stand);

  return { chairGroup, colorMeshes: [seat, back, base] };
};

const resizeRenderer = () => {
  if (!renderer) return;
  const canvas = renderer.domElement;
  const { clientWidth, clientHeight } = canvas;
  renderer.setSize(clientWidth, clientHeight, false);
  if (camera) {
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
  }
};

const handlePointerMove = (event) => {
  updatePointer(event);
  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(getSeatTargets(), true);
  const seatRef = findSeatRefFromIntersection(intersects[0]);
  const mesh = seatRef?.colorMeshes?.[0] ?? null;
  if (mesh !== hoveredSeatMesh) {
    if (hoveredSeatMesh) hoveredSeatMesh.material.emissive?.setHex(0x000000);
    hoveredSeatMesh = mesh;
    if (hoveredSeatMesh) {
      if (!hoveredSeatMesh.material.emissive) {
        hoveredSeatMesh.material.emissive = new Color(0x000000);
      }
      hoveredSeatMesh.material.emissive.setHex(0x555555);
    }
  }
};

const handlePointerDown = (event) => {
  updatePointer(event);
  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(getSeatTargets(), true);
  if (!intersects.length) return;
  const seatId = findSeatIdFromIntersection(intersects[0]);
  if (!seatId) return;
  const newStatus = nextStatus(attendanceState[seatId]);
  applySeatStatus(seatId, newStatus);
};

const getSeatTargets = () => Array.from(seatRefs.values()).map((ref) => ref.root);

const findSeatRefFromIntersection = (intersection) => {
  if (!intersection) return null;
  const seatObject = climbToSeat(intersection.object);
  if (!seatObject) return null;
  return seatRefs.get(seatObject.userData.seatId) ?? null;
};

const findSeatIdFromIntersection = (intersection) => {
  const seatObject = climbToSeat(intersection.object);
  return seatObject?.userData?.seatId ?? null;
};

const climbToSeat = (object) => {
  let current = object;
  while (current && !current.userData?.seatId) {
    current = current.parent;
  }
  return current;
};

const updatePointer = (event) => {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
};

const animate = () => {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
};

const hydrateForDate = (dateKey) => {
  currentDateKey = dateKey;
  attendanceState = loadStateForDate(dateKey);
  if (!sceneInitialized) {
    buildScene();
  } else {
    refreshDeskColors();
  }
};

const refreshDeskColors = () => {
  seatRefs.forEach((ref, seatId) => {
    const status = attendanceState[seatId] || "unmarked";
    ref.colorMeshes.forEach((mesh) => mesh.material.color.setHex(STATUS_COLORS[status]));
  });
};

const resetDay = () => {
  attendanceState = {};
  saveStateForDate();
  refreshDeskColors();
};

const exportCSV = () => {
  const rows = [["Date", "Student", "Status"]];
  COLUMN_DATA.forEach((students, colIdx) => {
    students.forEach((student) => {
      const seatId = `c${colIdx}-${student}`;
      rows.push([currentDateKey, student, attendanceState[seatId] || "unmarked"]);
    });
  });
  const csv = rows.map((row) => row.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `attendance-${currentDateKey}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const init = () => {
  const isoToday = todayISO();
  dateInput.value = isoToday;
  hydrateForDate(isoToday);
  dateInput.addEventListener("change", (event) => hydrateForDate(event.target.value));
  resetBtn.addEventListener("click", resetDay);
  exportBtn.addEventListener("click", exportCSV);
};

document.addEventListener("DOMContentLoaded", init);

