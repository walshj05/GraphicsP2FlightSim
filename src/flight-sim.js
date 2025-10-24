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
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { generateTerrain, extractTop, extractBottom, extractLeft, extractRight } from './terrain-generation.js';

// const WING_SPAN = 11; // meters
// const MAX_SPEED = 55; // m/s
// const MAX_ALTITUDE = 4200; // meters
// const GRAVITY = 9.81; // m/s^2

//for scene 
const USE_ORBIT_CONTROLS = true;
const DEBUG = true;
const [SCENE, CAMERA, RENDERER, CONTROLLER, SKY] = initScene();

// for airplane
let AIRCRAFT;

// for sky
let sunAngle = 180;
let dayState = { t:0 };
let tweenStarted = false;
const duration = 60000;

// for terrain
const SQUARE_SIZE = 2000; // meters
const chunkHeights = {};
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
    mesh.position.set(x * SQUARE_SIZE, -100, y * SQUARE_SIZE);

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
    const camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        10000
    );

    const { sunPosition, sky } = initializeSky(scene);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    const container = document.getElementById('container');
    container.appendChild(renderer.domElement);
    const controls = initializeOrbitControls(camera, renderer);
    const aircraft = initializeAircraft(scene)

    camera.position.set(4, 1, 9);
    camera.lookAt(0, 0, 0);
    controls.update();

    const sunDirectionalLight = initializeLights(scene, sunPosition, sky);
    if (DEBUG) {
        const sphereGeometry = new THREE.SphereGeometry(1, 32, 32);
        const sphereMaterial = new THREE.MeshStandardMaterial({ color: 0xff00 });
        const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
        scene.add(sphere);
        sunDirectionalLight.target = sphere;
    }

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
 * Initializes FlyControls for camera interaction using keyboard input.
 * @param {THREE.Camera} camera - The camera to control.
 * @param {THREE.WebGLRenderer} renderer - Renderer used to attach event listeners.
 * @returns {FlyControls}
 */
// function initializeFlyControls(camera, renderer) {
//     const controls = new FlyControls(camera, renderer.domElement);
//     controls.movementSpeed = 100;
// controls.movementSpeed = 150;
// controls.rollSpeed = Math.PI / 24;
// controls.dragToLook = true;
//     return controls;
// }

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
    sunDirectionalLight.shadow.mapSize.width = 2048;
    sunDirectionalLight.shadow.mapSize.height = 2048;
    sunDirectionalLight.shadow.camera.near = 0.5;
    sunDirectionalLight.shadow.camera.far = 5000;
    sunDirectionalLight.position.copy(sunPosition);
    scene.add(sunDirectionalLight);

    const moonDirectionalLight = new THREE.DirectionalLight(0xF4F4F8, 0.2);
    moonDirectionalLight.castShadow = true;
    moonDirectionalLight.shadow.mapSize.width = 2048;
    moonDirectionalLight.shadow.mapSize.height = 2048;
    moonDirectionalLight.shadow.camera.near = 0.5;
    moonDirectionalLight.shadow.camera.far = 5000;
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
    sky.scale.setScalar(450000);
    sky.material.uniforms.turbidity.value = 10;
    sky.material.uniforms.rayleigh.value = 1.2;
    sky.material.uniforms.mieCoefficient.value = 0.00005;
    sky.material.uniforms.mieDirectionalG.value = 0.02;

    const phi = THREE.MathUtils.degToRad(270);
    const theta = THREE.MathUtils.degToRad(330);
    const sunPosition = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);

    sky.material.uniforms.sunPosition.value = sunPosition;
    scene.add(sky);
    scene.fog = new THREE.Fog(0xaaaaaa, 50, 5000);
    return { sunPosition, sky };
}

/**
 * Creates a mock aircraft
 * @param {THREE.Scene} scene - Scene to attach the aircraft
 * @return aircraft
 * */
function initializeAircraft(scene) {
    const mtlPath = new URL('./models/11804_Airplane_v2_l2.mtl', import.meta.url).href;
    const objPath = new URL('./models/11804_Airplane_v2_l2.obj', import.meta.url).href;
    const texPath = new URL('./images/11804_Airplane_diff.jpg', import.meta.url).href;

    const mtlLoader = new MTLLoader();
    mtlLoader.load(mtlPath, (materials) => {
        materials.preload();
        const objLoader = new OBJLoader();
        objLoader.setMaterials(materials);
        objLoader.load(objPath, (object) => {
            const texture = new THREE.TextureLoader().load(texPath);
            object.traverse((child) => {
                if (child.isMesh) {
                    child.material.map = texture;
                    child.material.needsUpdate = true;
                }
            });
            object.scale.set(0.01, 0.01, 0.01);
            object.rotation.x = -Math.PI / 2;
            object.position.set(0, 3, 0);
            AIRCRAFT = object;
            AIRCRAFT.castShadow = true;
            if (!DEBUG) { scene.add(object) }
        });
    });
}

/**
 * Updates the sun's position over time to simulate a moving sky.
 */
// function updateSky() {
//     if (DEBUG) {
//         sunState.phiDeg = sunAngle;
//     } else {
//         if (!tweenStarted) {
//             new TWEEN.Tween(sunState)
//                 .to({ phiDeg: 360 }, 60000)
//                 .onUpdate(() => {})
//                 .repeat(Infinity)
//                 .start();
//             tweenStarted = true;
//         }
//         TWEEN.update();
//     }
//     const theta = THREE.MathUtils.degToRad(180);
//     const phi = THREE.MathUtils.degToRad(180 - sunState.phiDeg);
//     const sunPosition = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
//     SKY.material.uniforms.sunPosition.value.copy(sunPosition);
//     SKY.userData.sunLight.position.copy(sunPosition);
//     SKY.userData.sunLight.lookAt(0, 0, 0);
//     SKY.userData.sunLight.intensity = Math.max(0, Math.cos(phi));
//     SKY.userData.moonLight.position.copy(sunPosition);
//     SKY.userData.moonLight.position.multiplyScalar(-1);
//     SKY.userData.moonLight.lookAt(0, 0, 0);
//     SKY.userData.moonLight.intensity = Math.max(0, -Math.cos(phi));
// }

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
    if (t < 0.25) {
        // Midnight → Sunrise
        sunColor.lerpColors(midnight, sunrise, t / 0.25);
        skyColor.lerpColors(nightSky, daySky, t / 0.25);
    } else if (t < 0.5) {
        // Sunrise → Noon
        sunColor.lerpColors(sunrise, noon, (t - 0.25) / 0.25);
        skyColor.lerpColors(daySky, noon, (t - 0.25) / 0.25);
    } else if (t < 0.75) {
        // Noon → Sunset
        sunColor.lerpColors(noon, sunset, (t - 0.5) / 0.25);
        skyColor.lerpColors(daySky, sunset, (t - 0.5) / 0.25);
    } else {
        // Sunset → Midnight
        sunColor.lerpColors(sunset, midnight, (t - 0.75) / 0.25);
        skyColor.lerpColors(sunset, nightSky, (t - 0.75) / 0.25);
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



/**
 * Animation loop: updates sky, orbit controls, and renders each frame.
 * @returns {void}
 */
function animate() {
    requestAnimationFrame(animate);
    if (AIRCRAFT) {
        checkTerrainUpdate();
    }
    updateSky();
    CONTROLLER.update();
    RENDERER.castShadow = true;
    RENDERER.render(SCENE, CAMERA);
}
animate();

// /**
//  * Reset the scene back to default
//  * */
// function reset() {
//
// }