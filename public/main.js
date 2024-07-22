import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

var scene, camera, composer, renderer, labelRenderer, controls;
var groupPivot, roomGeometry, roomJson;

var trackingSpheres = [];

var pulse = 1;
var pulseValue = 0.005;

const bloomParams = {
  threshold: 0,
  strength: 1,
  radius: 0.25,
  exposure: 1,
};

// note these are subtracted
const X_POS_ADJ = 1.5;
const Y_POS_ADJ = 5;

const PULSE_MIN = 1;
const PULSE_MAX = 1.25;

const CEILING_THRESHOLD = 2.7; // height to delineate upstairs from downstairs
const geoSphere = new THREE.SphereGeometry(0.2, 32, 16);
const materials = {
  green1: new THREE.LineBasicMaterial({ color: 0x03a062 }),
  green2: new THREE.LineBasicMaterial({ color: 0x41a003 }),
  brown: new THREE.LineBasicMaterial({ color: 0x7b403b }),
};

const trackerMaterials = [
  new THREE.MeshPhongMaterial({ emissive: 0xff2c04 }),
  new THREE.MeshPhongMaterial({ emissive: 0x2c2cff }),
  new THREE.MeshPhongMaterial({ emissive: 0x663399 }),
  new THREE.MeshPhongMaterial({ emissive: 0x41ff04 }),
];

//
//

async function initConfig() {
  var url = "/api/floors";
  fetch(url)
    .then((response) => response.json())
    .then((json) => {
      console.log(json);
      roomJson = json;
      initScene();
      initEvents();
      render();
    });
}

await initConfig();

//
//

function initEvents() {
  var source = new EventSource("/updates");
  source.addEventListener(
    "open",
    function (e) {
      console.log("Connection to the server established.");
    },
    false
  );
  source.onmessage = function (e) {
    updateTracker(JSON.parse(e.data));
  };
}

function updateTracker(updateData) {
  for (let key in updateData) {
    const tracker = updateData[key];
    var trackName = tracker.name;

    // find the tracking object
    var trackingObject = scene.getObjectByName(trackName, true);
    var trackingObjectLabel = scene.getObjectByName(trackName + '#label', true);
    if (!trackingObject) {
      var color = trackerMaterials[trackingSpheres.length + 1].color;

      var newSphere = new THREE.PointLight(color, 1, 5);
      newSphere.add(
        new THREE.Mesh(geoSphere, trackerMaterials[trackingSpheres.length + 1])
      );

      newSphere.name = trackName;
      newSphere.position.set(tracker.x - X_POS_ADJ, tracker.y - Y_POS_ADJ, tracker.z);

      trackingSpheres.push(newSphere);
      groupPivot.add(newSphere);
      trackingObject = scene.getObjectByName(trackName, true);

//
        
      var labelDiv = document.createElement( 'div' );
      labelDiv.className = 'label';
      labelDiv.textContent = `${trackName}`;
      labelDiv.style.color = '#ffffff';
      labelDiv.style.marginTop = '-1em';
      var labelElement = new CSS2DObject( labelDiv );
      labelElement.name = trackName + '#label';
      labelElement.position.set(tracker.x - X_POS_ADJ, tracker.y - Y_POS_ADJ, tracker.z); // copied from above
      groupPivot.add(labelElement);

      trackingObjectLabel = scene.getObjectByName(trackName + '#label', true);
      
    }
    trackingObject.position.set(tracker.x - X_POS_ADJ, tracker.y - Y_POS_ADJ, tracker.z);
    trackingObjectLabel.position.set(tracker.x - X_POS_ADJ, tracker.y - Y_POS_ADJ, tracker.z);
  }
}

function initScene() {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ReinhardToneMapping;

  labelRenderer = new CSS2DRenderer({});
  labelRenderer.setSize( window.innerWidth, window.innerHeight );
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.top = '0px';

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  scene.add(camera);

  controls = new OrbitControls(camera, labelRenderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 25;
  controls.maxDistance = 50;

  const renderScene = new RenderPass(scene, camera);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.5,
    0.4,
    0.85
  );
  bloomPass.threshold = bloomParams.threshold;
  bloomPass.strength = bloomParams.strength;
  bloomPass.radius = bloomParams.radius;

  const outputPass = new OutputPass();

  composer = new EffectComposer(renderer);
  composer.addPass(renderScene);
  composer.addPass(bloomPass);
  composer.addPass(outputPass);

  bloomPass.threshold = bloomParams.threshold;
  bloomPass.strength = bloomParams.strength;
  bloomPass.radius = bloomParams.radius;
  renderer.toneMappingExposure = bloomParams.exposure;

  document.body.appendChild(renderer.domElement);
  document.body.appendChild(labelRenderer.domElement);

  roomGeometry = [];

  groupPivot = new THREE.Group();
  scene.add(groupPivot);

  roomJson.forEach((floor) => {
    console.log(floor.name);

    var floor_base = floor.bounds[0][2];
    var floor_ceiling = floor.bounds[1][2];

    floor.rooms.forEach((room) => {
      console.log(room.name);

      var points3d = [];
      room.points.forEach((points) => {
        points3d.push(new THREE.Vector3(points[0], points[1], floor_base));
        points3d.push(new THREE.Vector3(points[0], points[1], floor_ceiling));
        points3d.push(new THREE.Vector3(points[0], points[1], floor_base));
      });

      room.points.forEach((points) => {
        points3d.push(new THREE.Vector3(points[0], points[1], floor_ceiling));
      });

      var lines = new THREE.BufferGeometry().setFromPoints(points3d);

      if (floor_base > CEILING_THRESHOLD) {
        if (room.name != "") {
          roomGeometry.push(new THREE.Line(lines, materials.green2));
        }
      } else {
        roomGeometry.push(new THREE.Line(lines, materials.green1));
      }
    });
  });

  roomGeometry.forEach((room3d) => {
    room3d.position.set(-X_POS_ADJ, -Y_POS_ADJ, 0);
    groupPivot.add(room3d);
  });

  groupPivot.rotation.x = 5.2;
  groupPivot.rotation.z = 10.2;

  camera.position.set(0, 0, 23);
  controls.update();

  window.addEventListener("resize", onWindowResize);
}

function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  camera.lookAt(scene.position);
}

function render() {
  pulse += pulseValue;
  trackingSpheres.forEach((sphere) => {
    sphere.scale.set(pulse, pulse, pulse);
  });
  if (pulse >= PULSE_MAX) {
    pulseValue = -0.005;
  }
  if (pulse <= PULSE_MIN) {
    pulseValue = 0.005;
  }

  groupPivot.rotation.z += 0.002;

  controls.update();

  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);

  composer.render();

  requestAnimationFrame(render);
}
