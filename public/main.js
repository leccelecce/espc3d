import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

var scene, camera, composer, renderer, labelRenderer, controls;
var groupPivot, roomGeometry, nodesJson, roomJson;

var showMidPointLight = false;

var trackingSpheres = [];

var pulse = 1;
var pulseValue = 0.005;

const bloomParams = {
  threshold: 0,
  strength: 0.95,
  radius: 0.25,
  exposure: 1,
};

// starting position adjustments
// note these are subtracted
const X_POS_ADJ = 1.5;
const Y_POS_ADJ = 5;

const CAM_START_X = 0;
const CAM_START_Y = 0;
const CAM_START_Z = 23;

const CONTROLS_MIN_DISTANCE = 15;
const CONTROLS_MAX_DISTANCE = 40;

const PULSE_MIN = 1;
const PULSE_MAX = 1.25;

const CEILING_THRESHOLD = 12.7; // height to delineate upstairs from downstairs

const geoSphere = new THREE.SphereGeometry(0.2, 32, 16);

const materials = {
  green1: new THREE.LineBasicMaterial({ color: 0x03a062 }),
  green2: new THREE.LineBasicMaterial({ color: 0x41a003 }),
  brown: new THREE.LineBasicMaterial({ color: 0x7b403b }),
};

const trackerMaterials = [
  new THREE.MeshPhongMaterial({ emissive: 0xff0000 }),
  new THREE.MeshPhongMaterial({ emissive: 0xffbb00 }),
  new THREE.MeshPhongMaterial({ emissive: 0xffee00 }),
];

var trackerLabels = [];

//
//

async function initConfig() {
  fetch("/api/nodes")
  .then((response) => response.json())
  .then((json) => {
    console.log(json);
    nodesJson = json;

    fetch("/api/floors")
    .then((response) => response.json())
    .then((json) => {
      console.log(json);
      roomJson = json;
      initScene();
      initEvents();
      render();
    });

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
        
      var labelDivEle = document.createElement( 'div' );
      labelDivEle.style.color = '#ffffff';
      labelDivEle.style.fontFamily = 'Arial';
      labelDivEle.style.fontSize = '0.8rem;';
      labelDivEle.style.marginTop = '-1em';
      
      var labelDivLine1 = document.createElement( 'div' );
      labelDivLine1.textContent = `${trackName}`;

      var labelDivLine2 = document.createElement( 'div' );
      labelDivLine2.textContent = `${tracker.confidence}% confidence from ${tracker.fixes} fixes`;
      
      labelDivEle.append(labelDivLine1, labelDivLine2);

      trackerLabels[trackName] = labelDivLine2;

      var labelElement = new CSS2DObject( labelDivEle );
      labelElement.name = trackName + '#label';
      labelElement.position.set(tracker.x - X_POS_ADJ, tracker.y - Y_POS_ADJ, tracker.z);
      
      groupPivot.add(labelElement);

      trackingObjectLabel = scene.getObjectByName(trackName + '#label', true);
      
    }
    trackingObject.position.set(tracker.x - X_POS_ADJ, tracker.y - Y_POS_ADJ, tracker.z);
    trackingObjectLabel.position.set(tracker.x - X_POS_ADJ, tracker.y - Y_POS_ADJ, tracker.z);

    trackerLabels[trackName].textContent = `${tracker.confidence}% confidence from ${tracker.fixes} fixes`;
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
  controls.minDistance = CONTROLS_MIN_DISTANCE;
  controls.maxDistance = CONTROLS_MAX_DISTANCE;

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

  
  nodesJson.forEach((node) => {
    console.log(node.name);

    if (!node.enabled || !node.stationary)
      return;

    var midPointLight = new THREE.PointLight( 0x5555ff, 1, 0.1);
    midPointLight.add(
      new THREE.Mesh(new THREE.SphereGeometry(0.08, 32, 16), new THREE.MeshPhongMaterial({ emissive: 0x5555ff }))
    );

    midPointLight.position.set(node.point[0]-X_POS_ADJ, node.point[1]-Y_POS_ADJ, node.point[2]);
    groupPivot.add(midPointLight);

    createLabelForNode(node, groupPivot);

  });

  if (showMidPointLight) {
    var bbox = new THREE.Box3().setFromObject(groupPivot);

    var bboxMidPoint = new THREE.Vector3();
    bboxMidPoint.lerpVectors(bbox.min, bbox.max, 0.5);

    // add a point in the middle of the bounding box i.e. what we'll be rotating around for debug reference
    var midPointLight = new THREE.PointLight( 0xffffff, 1, 0.1);
    midPointLight.add(
      new THREE.Mesh(new THREE.SphereGeometry(0.08, 32, 16), new THREE.MeshPhongMaterial({ emissive: 0xffffff }))
    );

    midPointLight.position.set(bboxMidPoint.x, bboxMidPoint.y, 0);
    groupPivot.add(midPointLight);
  }

  groupPivot.rotation.x = 5.2;
  groupPivot.rotation.z = 10.2;

  camera.position.set(CAM_START_X, CAM_START_Y, CAM_START_Z);
  controls.update();

  window.addEventListener("resize", onWindowResize);
}

function createLabelForNode(node, groupPivot) {
  var labelDivEle = document.createElement( 'div' );
  labelDivEle.style.color = '#6666ff';
  labelDivEle.style.fontFamily = 'Arial';
  labelDivEle.style.fontSize = '0.8rem;';
  labelDivEle.style.marginTop = '-1em';
  
  var labelDivLine1 = document.createElement( 'div' );
  labelDivLine1.textContent = `${node.name}`;
  
  labelDivEle.append(labelDivLine1);

  var labelElement = new CSS2DObject( labelDivEle );
  labelElement.name = node.name + '#label';
  labelElement.position.set(node.point[0] - X_POS_ADJ, node.point[1] - Y_POS_ADJ, node.point[2]);

  groupPivot.add(labelElement);
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
