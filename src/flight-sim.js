/**
 * Initializes a 3D environment using Three.js with a dynamic sky,
 * lighting, terrain utilities, and optional debug helpers.
 * @authors
 *  - Jon Walsh
 *  - Jamell Alverez
 */

import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import * as TWEEN from 'three/examples/jsm/libs/tween.module.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { generateTerrain, extractTop, extractBottom, extractLeft, extractRight } from './terrain-generation.js';

// Physics constants
const WING_SPAN = 11; // meters
const MAX_SPEED = 55; // m/s
const MAX_ALTITUDE = 4200; // meters
const GRAVITY = 9.81; // m/s^2
const directionalVector = new THREE.Vector3(-1, 0, 0);
const angularVelocity = new THREE.Vector3(0, 0, 0);
const velocity = new THREE.Vector3(0, 0, 0);
let throttle = 0.5;
const acceleration = directionalVector.clone().multiplyScalar(throttle * 10);

// for shadows
const SHADOW_MAP_SIZE = 2048;
const SHADOW_CAMERA_NEAR = 0.5;
const SHADOW_CAMERA_FAR = 5000;

// for sky
let sunAngle = 180;
let dayState = { t:0 };
let tweenStarted = false;
const duration = 60000;
const skyScale = 450000;
const SUNSETTINGS = {
    turbidity: 10,
    rayleigh: 1.2,
    mieCoefficient: 0.00005,
    mieDirectionalG: 0.02,
    inclination: 0.49, // elevation / inclination
    azimuth: 0.25 // Facing front,
};
const skyInitialPhi = 270;
const skyInitialTheta = 180;
const fogFar = 3500;
const fiftSecondInterval = 0.25;
const thirtySecondInterval = 0.50;
const fortFiveSecondInterval = 0.75;

//for scene 
const USE_ORBIT_CONTROLS = true;
const DEBUG = false;
const [SCENE, CAMERA, RENDERER, CONTROLLER, SKY] = initScene();

// for airplane
let AIRCRAFT;
let MIXER; // Animation mixer for GLB animations
let CLOCK = new THREE.Clock(); // Clock for animation timing
let deltaTime = 0;

// for terrain
const SQUARE_SIZE = 2000; // meters
const chunkHeights = {};
const terrainYPosition = -100;
const neighborDirections = [
    [1, 0], [-1, 0],
    [0, 1], [0, -1],
    [1, 1], [-1, -1],
    [1, -1], [-1, 1]
];

// textures and materials
const terrainTexture = new THREE.TextureLoader().load(new URL('https://cdn.architextures.org/textures/23/10/grass-none-e6q3dt.jpg', import.meta.url).href);
terrainTexture.wrapS = THREE.RepeatWrapping;
terrainTexture.wrapT = THREE.RepeatWrapping;
terrainTexture.repeat.set( 10, 10 );
const terrainMaterial = new THREE.MeshStandardMaterial({ map: terrainTexture });

/**
 * Adds a terrain chunk at the specified (x, y) grid position if it doesn't already exist.
 * @param {*} x integer x position
 * @param {*} y integer y position
 * @returns 
 */
function addTerrainChunk(x, y) {
    const key = `${x},${y}`;
    if (chunkHeights[key]) {
        return; // Chunk already exists
    }
    
    // Determine edge indexes
    const topIndex = `${x},${y + 1}`;
    const bottomIndex = `${x},${y - 1}`;
    const leftIndex = `${x - 1},${y}`;
    const rightIndex = `${x + 1},${y}`;
    const topEdge = chunkHeights[topIndex] ? extractBottom(chunkHeights[topIndex]) : null;
    const bottomEdge = chunkHeights[bottomIndex] ? extractTop(chunkHeights[bottomIndex]) : null;
    const leftEdge = chunkHeights[leftIndex] ? extractRight(chunkHeights[leftIndex]) : null;
    const rightEdge = chunkHeights[rightIndex] ? extractLeft(chunkHeights[rightIndex]) : null;

    // Generate new terrain chunk with edge constraints
    const newTerrain = generateTerrain(5, 5, {
        top: topEdge,
        bottom: bottomEdge,
        left: leftEdge,
        right: rightEdge
    });
    chunkHeights[key] = newTerrain;
    addTerrainMesh(x, y);
}

/**
 * Generates terrain chunks for the specified (x, y) grid position and its 8 neighbors.
 * @param {*} x integer x position
 * @param {*} y integer y position
 * @returns 
 */
function generateNeighboringChunks(x, y) {
    // Generate the central chunk and its 8 neighbors
    addTerrainChunk(x, y);
    for (const [dx, dy] of neighborDirections) {
        addTerrainChunk(x + dx, y + dy);
    }
}

/**
 * Adds a terrain chunk at the specified (x, y) grid position if it doesn't already exist.
 * @param {*} x integer x position
 * @param {*} y integer y position
 * @returns 
 */
function addTerrainMesh(x, y) {
    const key = `${x},${y}`;
    const terrainData = chunkHeights[key];
    if (!terrainData) {
        return; // No terrain data available
    }
    
    const size = terrainData.length - 1;
    const geometry = new THREE.PlaneGeometry(SQUARE_SIZE, SQUARE_SIZE, size, size);
    const mesh = new THREE.Mesh(geometry, terrainMaterial);
    for (let i = 0; i <= size; i++) {
        for (let j = 0; j <= size; j++) {
            const vertexIndex = i * (size + 1) + j;
            geometry.attributes.position.setZ(vertexIndex, terrainData[i][j]);
        }
    }
    geometry.computeVertexNormals();
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = Math.PI; // Correct orientation
    mesh.position.set(x * SQUARE_SIZE, terrainYPosition, y * SQUARE_SIZE);

    mesh.receiveShadow = true;
    mesh.castShadow = true;
    SCENE.add(mesh);
}


/**
 * Adds visual helpers to the scene for debugging.
 * Includes axis-helper, grid helper, and a light helper.
 * @returns {void}
 */
function addHelpers() {
    const axesHelper = new THREE.AxesHelper(500);
    SCENE.add(axesHelper);
    const gridHelper = new THREE.GridHelper(10000, 100, 0x888888, 0x444444);
    SCENE.add(gridHelper);
    const lightHelper = new THREE.DirectionalLightHelper(SKY.userData.sunLight, 5);
    SCENE.add(lightHelper);
    const controlsGroup = document.getElementById('controls') || document.createElement('div');
    controlsGroup.id = 'controls';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '360';
    slider.value = '90';
    slider.id = 'sunSlider';
    controlsGroup.appendChild(slider);
    if (!document.getElementById('controls')) {
        document.body.appendChild(controlsGroup);
    }
    slider.addEventListener('input', (event) => {
        sunAngle = parseFloat(event.target.value);
    })
}

if (DEBUG) {
    addHelpers();
}

/**
 * Initializes the Three.js scene, camera, renderer, sky, lights, and orbit controls.
 * @returns {[THREE.Scene, THREE.Camera, THREE.WebGLRenderer, OrbitControls, Sky]}
 */
function initScene() {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);

    const {sunPosition, sky} = initializeSky(scene);
    const renderer = new THREE.WebGLRenderer({antialias: true});
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    const container = document.getElementById('container');
    container.appendChild(renderer.domElement);
    const controls = initializeOrbitControls(camera, renderer);
    const aircraft = initializeAircraft(scene);
    camera.position.set(0, 220, -30);
    camera.lookAt(camera.position.x, camera.position.y, camera.position.z + 100);
    controls.update();

    initializeLights(scene, sunPosition, sky);

    return [scene, camera, renderer, controls, sky, aircraft];
}

/**
 * Initializes OrbitControls for camera interaction using mouse input.
 * @param {THREE.Camera} camera - The camera to control.
 * @param {THREE.WebGLRenderer} renderer - Renderer used to attach event listeners.
 * @returns {OrbitControls}
 */
function initializeOrbitControls(camera, renderer) {
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enabled = USE_ORBIT_CONTROLS;
    return controls;
}

/**
 * Adds ambient light and directional sunlight to the scene.
 * Links the sun to the sky system for dynamic updates.
 * @param {THREE.Scene} scene - Scene to modify.
 * @param {THREE.Vector3} sunPosition - Initial sun direction.
 * @param {Sky} sky - Sky object for shared light reference.
 * @returns {THREE.DirectionalLight}
 */
function initializeLights(scene, sunPosition, sky) {
    const ambientLight = new THREE.AmbientLight(0xffffff, .01);
    scene.add(ambientLight);

    const sunDirectionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    sunDirectionalLight.castShadow = true;
    sunDirectionalLight.shadow.mapSize.width = SHADOW_MAP_SIZE;
    sunDirectionalLight.shadow.mapSize.height = SHADOW_MAP_SIZE;
    sunDirectionalLight.shadow.camera.near = SHADOW_CAMERA_NEAR;
    sunDirectionalLight.shadow.camera.far = SHADOW_CAMERA_FAR;
    sunDirectionalLight.position.copy(sunPosition);
    scene.add(sunDirectionalLight);

    const moonDirectionalLight = new THREE.DirectionalLight(0xF4F4F8, 0.2);
    moonDirectionalLight.castShadow = true;
    moonDirectionalLight.shadow.mapSize.width = SHADOW_MAP_SIZE;
    moonDirectionalLight.shadow.mapSize.height = SHADOW_MAP_SIZE;
    moonDirectionalLight.shadow.camera.near = SHADOW_CAMERA_NEAR;
    moonDirectionalLight.shadow.camera.far = SHADOW_CAMERA_FAR;
    moonDirectionalLight.position.copy(sunPosition);
    moonDirectionalLight.position.multiplyScalar(-1);
    scene.add(moonDirectionalLight);

    sky.userData.sunLight = sunDirectionalLight;
    sky.userData.moonLight = moonDirectionalLight;
    return sunDirectionalLight;
}

/**
 * Creates and configures a realistic sky using atmospheric scattering.
 * @param {THREE.Scene} scene - Scene to attach the sky.
 * @returns {{sunPosition: THREE.Vector3, sky: Sky}}
 */
function initializeSky(scene) {
    const sky = new Sky();
    sky.scale.setScalar(skyScale);
    sky.material.uniforms.turbidity.value = SUNSETTINGS.turbidity;
    sky.material.uniforms.rayleigh.value = SUNSETTINGS.rayleigh;
    sky.material.uniforms.mieCoefficient.value = SUNSETTINGS.mieCoefficient;
    sky.material.uniforms.mieDirectionalG.value = SUNSETTINGS.mieDirectionalG;
    const phi = THREE.MathUtils.degToRad(skyInitialPhi);
    const theta = THREE.MathUtils.degToRad(skyInitialTheta);
    const sunPosition = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    sky.material.uniforms.sunPosition.value = sunPosition;
    scene.add(sky);
    scene.fog = new THREE.Fog('white', 1, fogFar);
    return { sunPosition, sky };
}

/**
 * Creates a mock aircraft
 * @param {THREE.Scene} scene - Scene to attach the aircraft
 * @return aircraft
 * */
function initializeAircraft(scene) {
    const glbPath = new URL('./models/cargo_aircraft.glb', import.meta.url).href;
    const glbLoader = new GLTFLoader();

    glbLoader.load(glbPath, (gltf) => {
        const object = gltf.scene;
        AIRCRAFT = object;
        AIRCRAFT.castShadow = true;
        object.position.set(0, 200, 0);

        //scaling the whole model to 11 meters
        const box = new THREE.Box3().setFromObject(object);
        const size = new THREE.Vector3();
        box.getSize(size);
        const realWingspan = 52;
        const scaleFactor = realWingspan / size.x;
        object.scale.setScalar(scaleFactor);
        if (gltf.animations && gltf.animations.length > 0) {
            MIXER = new THREE.AnimationMixer(object);
            gltf.animations.forEach((clip) => {
                const action = MIXER.clipAction(clip);
                action.play();
            });
        }
        scene.add(object);
    })
}


/**
 * Updates the sun's position over time to simulate a moving sky.
 */
function updateSky() {
    const t = updateTimeCycle();
    const { phi, sunIntensity, moonIntensity } = updateSunAndMoonPositions(t);
    const { sunColor, skyColor } = updateSkyColors(t);
    updateLighting(phi, sunIntensity, moonIntensity, sunColor, skyColor);
}

/**
 * Updates time and tween cycle for day
 * */
function updateTimeCycle() {
    if (DEBUG) {
        return (dayState.t = sunAngle / 360);
    }
    if (!tweenStarted) {
        new TWEEN.Tween(dayState)
            .to({ t: 1 }, duration)
            .easing(TWEEN.Easing.Linear.None)
            .onComplete(() => (dayState.t = 0))
            .repeat(Infinity)
            .start();
        tweenStarted = true;
    }
    TWEEN.update();
    return dayState.t;
}

/**
 * Updates sun and moon positions based on time
 * */
function updateSunAndMoonPositions(t) {
    const theta = THREE.MathUtils.degToRad(180);
    const phi = THREE.MathUtils.degToRad(180 - t * 360);
    const sunPosition = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    SKY.material.uniforms.sunPosition.value.copy(sunPosition);
    SKY.userData.sunLight.position.copy(sunPosition);
    SKY.userData.sunLight.lookAt(0, 0, 0);
    SKY.userData.moonLight.position.copy(sunPosition).multiplyScalar(-1);
    SKY.userData.moonLight.lookAt(0, 0, 0);
    const sunIntensity = Math.max(0, Math.cos(phi));
    const moonIntensity = Math.max(0, -Math.cos(phi));
    return { phi, sunIntensity, moonIntensity, sunPosition };
}

/**
 * Updates sun and sky colors based on time
 * */
function updateSkyColors(t) {
    const midnight = new THREE.Color(0x112244);
    const sunrise = new THREE.Color(0xffb366);
    const noon = new THREE.Color(0xffffff);
    const sunset = new THREE.Color(0xff8844);
    const nightSky = new THREE.Color(0x000011);
    const daySky = new THREE.Color(0x87ceeb);
    let sunColor = new THREE.Color();
    let skyColor = new THREE.Color();
    if (t < fiftSecondInterval) {
        // Midnight → Sunrise
        sunColor.lerpColors(midnight, sunrise, t / fiftSecondInterval);
        skyColor.lerpColors(nightSky, daySky, t / fiftSecondInterval);
    } else if (t < thirtySecondInterval) {
        // Sunrise → Noon
        sunColor.lerpColors(sunrise, noon, (t - fiftSecondInterval) / fiftSecondInterval);
        skyColor.lerpColors(daySky, noon, (t - fiftSecondInterval) / fiftSecondInterval);
    } else if (t < fortFiveSecondInterval) {
        // Noon → Sunset
        sunColor.lerpColors(noon, sunset, (t - thirtySecondInterval) / fiftSecondInterval);
        skyColor.lerpColors(daySky, sunset, (t - thirtySecondInterval) / fiftSecondInterval);
    } else {
        // Sunset → Midnight
        sunColor.lerpColors(sunset, midnight, (t - fortFiveSecondInterval) / fiftSecondInterval);
        skyColor.lerpColors(sunset, nightSky, (t - fortFiveSecondInterval) / fiftSecondInterval);
    }
    return { sunColor, skyColor };
}

/**
 *
 * **/
function updateLighting(phi, sunIntensity, moonIntensity, sunColor, skyColor) {
    const sunLight = SKY.userData.sunLight;
    const moonLight = SKY.userData.moonLight;
    const ambient = SCENE.children.find(obj => obj.isAmbientLight);
    sunLight.intensity = THREE.MathUtils.lerp(0.05, 1.5, sunIntensity);
    moonLight.intensity = THREE.MathUtils.lerp(0.05, 0.3, moonIntensity);
    ambient && (ambient.intensity = THREE.MathUtils.lerp(0.05, 0.5, sunIntensity));
    sunLight.color.copy(sunColor);
    moonLight.color.copy(new THREE.Color(0xB0C4DE)); //soft blue
    ambient && ambient.color.copy(sunColor.clone().multiplyScalar(0.5));
    SCENE.background = skyColor;
    SCENE.fog.color.copy(skyColor.clone().lerp(new THREE.Color(0x111111),0.3));
}


/**
 * Checks the aircraft's position and generates new terrain chunks as needed.
 */
function checkTerrainUpdate() {
    const planePosition = AIRCRAFT.position;
    const chunkX = Math.floor(planePosition.x / SQUARE_SIZE);
    const chunkY = Math.floor(planePosition.z / SQUARE_SIZE);
    generateNeighboringChunks(chunkX, chunkY);
}

function updateCameraPosition() {
    const [x, y, z] = AIRCRAFT.position;
    CAMERA.position.set(x, y + 10, z - 20);
    CAMERA.lookAt(x, y, z);
}

function updateAircraft(delta) {
    // Update aircraft position and orientation based on physics
    // Placeholder logic for demonstration purposes
    AIRCRAFT.position.z += 10; 

    AIRCRAFT.rotation.x = angularVelocity.x * (1 - 3 * delta);
    AIRCRAFT.rotation.y = angularVelocity.y * (1 - 3 * delta);
    AIRCRAFT.rotation.z = angularVelocity.z * (1 - 3 * delta);

}

/**
 * Animation loop: updates sky, orbit controls, and renders each frame.
 * @returns {void}
 */
function animate() {
    requestAnimationFrame(animate);
    const delta = CLOCK.getDelta();
    deltaTime = delta;
    if (MIXER) {
        MIXER.update(delta);
    }
    if (AIRCRAFT) {
        updateAircraft(delta);
        updateCameraPosition();
        checkTerrainUpdate();
        if(USE_ORBIT_CONTROLS) {
            CONTROLLER.target.copy(AIRCRAFT.position);
        }
    }
    updateSky();
    CONTROLLER.update();
    RENDERER.castShadow = true;
    RENDERER.render(SCENE, CAMERA);
}
animate();

function onWindowResize() {
    CAMERA.aspect = window.innerWidth / window.innerHeight;
    CAMERA.updateProjectionMatrix();
    RENDERER.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onWindowResize, false);

function onDocumentKeyDown(event) {
    const keyCode = event.which;
    // Add key controls for aircraft here
    switch (keyCode) {
    case 87: // W
        // Pitch down
        angularVelocity.x += 2 * deltaTime;
        break;
    case 83: // S
        // Pitch up
        angularVelocity.x -= 2 * deltaTime;
        break;
    case 65: // A
        // Roll left
        angularVelocity.z += 2 * deltaTime;
        break;
    case 68: // D
        // Roll right
        angularVelocity.z -= 2 * deltaTime;
        break;
    case 81: // Q
        // Yaw left
        angularVelocity.y -= 2 * deltaTime;
        break;
    case 69: // E
        // Yaw right
        angularVelocity.y += 2 * deltaTime;
        break;
    case 32: // Space
        // Throttle large fall off
        throttle = Math.max(0, throttle - deltaTime * 3);
        break;
    case 16: // Shift
        // Throttle increases
        throttle = Math.min(1, throttle + deltaTime);
        break;
    case 17: // Ctrl
        // Throttle lessens
        throttle = Math.max(0, throttle - deltaTime);
        break;
    }
}
document.addEventListener('keydown', onDocumentKeyDown, false);

// /**
//  * Reset the scene back to default
//  * */
// function reset() {
//
// }