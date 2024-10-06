import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

var scene, camera, composer, renderer, labelRenderer, controls;
var groupPivot, roomGeometry, nodesJson, roomJson;

var showMidPointLight = false;

var trackingSpheres = [];

var pulse = 1;
var pulseValue = 0.005;

var zRotationSpeed = 0.002;

const bloomParams = {
  threshold: 0,
  strength: 0.95,
  radius: 0.25,
  exposure: 1,
};

const effectController = {
  zRotationSpeed: 0.002,
  showNodes: true,
  refreshNodes: function () {
    fetch("/api/nodes")
      .then((response) => response.json())
      .then((json) => {
        console.log(json);
        nodesJson = json;
        removeNodes();
        addNodes();
      });
  }
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

const geoSphere = new THREE.SphereGeometry(0.2, 32, 16);

const materials = {
  green1: new THREE.LineBasicMaterial({ color: 0x03a062 }),
};

const trackerMaterials = [
  new THREE.MeshPhongMaterial({ emissive: 0xff0000 }),
  new THREE.MeshPhongMaterial({ emissive: 0xffbb00 }),
  new THREE.MeshPhongMaterial({ emissive: 0xffee00 }),
];

const nodeMaterials = {
  online: new THREE.MeshPhongMaterial({ emissive: 0x5555ff }),
  offline: new THREE.MeshPhongMaterial({ emissive: 0xff2222 }),
}

const floorMaterial = new THREE.MeshBasicMaterial({ color: 0x03a062, side: THREE.DoubleSide, opacity: 0.03, transparent: true });

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
    const message = JSON.parse(e.data);
    updateTrackers(message.trackers);
    updateNodes(message.nodeStates);
  };
}

function updateNodes(updateData) {
  for (let key in updateData) {
    const nodeName = key;
    const status = updateData[key];

    var nodeObject = scene.getObjectByName("node#" + nodeName);

    if (!nodeObject) {
      continue;
    }

    var nodeObjectLabel = nodeObject.getObjectByName("nodeLabel", true);

    if (status == "online") {
      nodeObject.children[0].material = nodeMaterials['online'];
      nodeObjectLabel.element.style.color = '#5555ff';
    } else {
      nodeObject.children[0].material = nodeMaterials['offline'];
      nodeObjectLabel.element.style.color = '#dc2d2d';
    }

  }
}

function updateTrackers(updateData) {
  for (let key in updateData) {
    const tracker = updateData[key];
    var trackName = tracker.name;

    // find the tracking object
    var trackingObject = scene.getObjectByName(trackName, true);
    var trackingObjectLabel = scene.getObjectByName(trackName + '#label', true);

    // if we have an object, but the confidence has dropped to <= 1, remove it
    if (tracker.confidence <= 1) {
      if (trackingObject)
        scene.remove(trackingObject);
      continue;
    }

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

      var labelDivEle = document.createElement('div');
      labelDivEle.style.color = '#ffffff';
      labelDivEle.style.fontFamily = 'Arial';
      labelDivEle.style.fontSize = '0.8rem;';
      labelDivEle.style.marginTop = '-1em';

      var labelDivLine1 = document.createElement('div');

      var displayName = trackName.length > 15 ? (trackName.substring(0, 14) + '...') : trackName;

      labelDivLine1.textContent = `${displayName}`;

      var labelDivLine2 = document.createElement('div');
      labelDivLine2.textContent = `${tracker.confidence}% (${tracker.fixes} fixes)`;

      labelDivEle.append(labelDivLine1, labelDivLine2);

      trackerLabels[trackName] = labelDivLine2;

      var labelElement = new CSS2DObject(labelDivEle);
      labelElement.name = trackName + '#label';
      labelElement.position.set(tracker.x - X_POS_ADJ, tracker.y - Y_POS_ADJ, tracker.z);

      groupPivot.add(labelElement);

      trackingObjectLabel = scene.getObjectByName(trackName + '#label', true);

    }
    trackingObject.position.set(tracker.x - X_POS_ADJ, tracker.y - Y_POS_ADJ, tracker.z);
    trackingObjectLabel.position.set(tracker.x - X_POS_ADJ, tracker.y - Y_POS_ADJ, tracker.z);

    trackerLabels[trackName].textContent = `${tracker.confidence}% (${tracker.fixes} fixes)`;
  }
}

function initScene() {
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ReinhardToneMapping;

  labelRenderer = new CSS2DRenderer({});
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
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
    console.log("Floor: " + floor.name);

    var floor_base = floor.bounds[0][2];
    var floor_ceiling = floor.bounds[1][2];

    floor.rooms.forEach((room) => {
      console.log("Room: " + room.name);

      var points3d = [];
      var pointsFloor = [];

      room.points.forEach((points) => {
        points3d.push(new THREE.Vector3(points[0], points[1], floor_base));
        points3d.push(new THREE.Vector3(points[0], points[1], floor_ceiling));
        points3d.push(new THREE.Vector3(points[0], points[1], floor_base));

        // for floor drawing
        pointsFloor.push(new THREE.Vector3(points[0], points[1], floor_base));
      });

      // this draws the ceiling
      room.points.forEach((points) => {
        points3d.push(new THREE.Vector3(points[0], points[1], floor_ceiling));
      });

      var lines = new THREE.BufferGeometry().setFromPoints(points3d);

      roomGeometry.push(new THREE.Line(lines, materials.green1));

      // fill in the floor
      // first adjust to the right location
      pointsFloor.forEach((points) => {
        points.x = points.x + (-X_POS_ADJ);
        points.y = points.y + (-Y_POS_ADJ);
      });

      var floorShape = new THREE.Shape(pointsFloor);
      var floorGeometry = new THREE.ShapeGeometry(floorShape);
      var plane = new THREE.Mesh(floorGeometry, floorMaterial);

      // need to raise up the 2D shape
      plane.position.z = floor_base;

      groupPivot.add(plane);

    });
  });

  // move everything by the X,Y adjustment
  roomGeometry.forEach((room3d) => {
    room3d.position.set(-X_POS_ADJ, -Y_POS_ADJ, 0);
    groupPivot.add(room3d);
  });

  // add markers for the nodes
  if (effectController.showNodes) {

    var nodeGroup = createNodes();

    groupPivot.add(nodeGroup);
  }

  // optionally show the default camera focus point
  if (showMidPointLight) {
    var bbox = new THREE.Box3().setFromObject(groupPivot);

    var bboxMidPoint = new THREE.Vector3();
    bboxMidPoint.lerpVectors(bbox.min, bbox.max, 0.5);

    // add a point in the middle of the bounding box i.e. what we'll be rotating around for debug reference
    var midPointLight = new THREE.PointLight(0xffffff, 1, 0.1);
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

  doGuiSetup();

  window.addEventListener("resize", onWindowResize);
}

function createNodes() {

  const nodeGroup = new THREE.Group();
  nodeGroup.name = 'NodeGroup';

  nodesJson.forEach((node) => {
    console.log("Node: " + node.name + " " + node.id);

    if (!node.enabled || !node.stationary)
      return;

    var nodeObject = new THREE.PointLight(0x2222ff, 1, 0.1);
    nodeObject.add(
      new THREE.Mesh(new THREE.SphereGeometry(0.08, 32, 16), nodeMaterials['offline'])
    );

    nodeObject.position.set(node.point[0] - X_POS_ADJ, node.point[1] - Y_POS_ADJ, node.point[2]);

    nodeObject.name = "node#" + node.id;

    nodeObject.add(createLabelForNode(node))

    nodeGroup.add(nodeObject);

  });

  return nodeGroup;

}

function createLabelForNode(node) {
  var labelDivEle = document.createElement('div');
  labelDivEle.style.color = '#dc2d2d';
  labelDivEle.style.fontFamily = 'Arial';
  labelDivEle.style.fontSize = '0.8rem;';
  labelDivEle.style.marginTop = '-1em';

  var labelDivLine1 = document.createElement('div');
  labelDivLine1.textContent = `${node.name}`;

  labelDivEle.append(labelDivLine1);

  var labelElement = new CSS2DObject(labelDivEle);
  labelElement.name = "nodeLabel";

  return labelElement;
}

function doGuiSetup() {

  const nodeChanger = function () {
    if (effectController.showNodes) {
      addNodes();
    } else {
      removeNodes();
    }
  };

  const rotationChanger = function () {
    zRotationSpeed = effectController.zRotationSpeed;
  };

  // see https://lil-gui.georgealways.com/#
  const gui = new GUI({ title: 'Settings' });

  gui.add(effectController, 'zRotationSpeed', 0, 0.01, 0.001 ).onChange(rotationChanger);
  gui.add(effectController, 'showNodes', true).onChange(nodeChanger);
  gui.add(effectController, 'refreshNodes');

  // start hidden
  gui.close();

}

function removeNodes() {
  var nodeGroup = scene.getObjectByName("NodeGroup");
  removeObjectsWithChildren(nodeGroup);
}

function addNodes() {
  groupPivot.add(createNodes());
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

  groupPivot.rotation.z += zRotationSpeed;

  controls.update();

  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);

  composer.render();

  requestAnimationFrame(render);
}

// https://stackoverflow.com/a/73827012
function removeObjectsWithChildren(obj) {

  if (!obj)
    return;

  if (obj.children.length > 0) {
    for (var x = obj.children.length - 1; x >= 0; x--) {
      removeObjectsWithChildren(obj.children[x]);
    }
  }

  if (obj.geometry) {
    obj.geometry.dispose();
  }

  if (obj.material) {
    if (obj.material.length) {
      for (let i = 0; i < obj.material.length; ++i) {


        if (obj.material[i].map) obj.material[i].map.dispose();
        if (obj.material[i].lightMap) obj.material[i].lightMap.dispose();
        if (obj.material[i].bumpMap) obj.material[i].bumpMap.dispose();
        if (obj.material[i].normalMap) obj.material[i].normalMap.dispose();
        if (obj.material[i].specularMap) obj.material[i].specularMap.dispose();
        if (obj.material[i].envMap) obj.material[i].envMap.dispose();

        obj.material[i].dispose()
      }
    }
    else {
      if (obj.material.map) obj.material.map.dispose();
      if (obj.material.lightMap) obj.material.lightMap.dispose();
      if (obj.material.bumpMap) obj.material.bumpMap.dispose();
      if (obj.material.normalMap) obj.material.normalMap.dispose();
      if (obj.material.specularMap) obj.material.specularMap.dispose();
      if (obj.material.envMap) obj.material.envMap.dispose();

      obj.material.dispose();
    }
  }

  obj.removeFromParent();

  return true;
}