/**
 * Initializes a 3D environment using Three.js with a dynamic sky,
 * lighting, terrain utilities, and optional debug helpers.
 * @authors
 *  - Jon Walsh
 *  - Jamell Alverez
 */

import * as THREE from 'three';
import {Sky} from 'three/addons/objects/Sky.js';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls'
import * as TWEEN from 'three/examples/jsm/libs/tween.module.js';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {extractBottom, extractLeft, extractRight, extractTop, generateTerrain} from './terrain-generation.js';


// gui
const GUI_ELEMENTS = {
    speed: document.getElementById('speed'),
    altitude: document.getElementById('altitude')
};

// for collision
let isLanded = false;
const MAX_LANDING_ROLL = Math.PI/4; // radians, approx 28 degrees
const MAX_LANDING_PITCH = Math.PI/4; // radians
const MAX_LANDING_SPEED_Y = -30; // m/s (max gentle descent)
const AIRCRAFT_SAMPLE_POINTS_X = [-10, -4, 2, 8, 14, 20];
const AIRCRAFT_SAMPLE_POINTS_Z = [-26, -15.6, -5.2, 5.2, 15.6, 26];
const LANDING_THRESHOLD = 0.75; // meters
const LANDING_GEAR_Y_OFFSET = -1.5;
const helperAircraftMatrix = new THREE.Matrix4();
const helperCollisionPoint = new THREE.Vector3();

//for update physics
const helperForward = new THREE.Vector3();
const helperUp = new THREE.Vector3();
const helperAcceleration = new THREE.Vector3();
const helperHorizontalVel = new THREE.Vector3();
const helperDeltaEuler = new THREE.Euler();
const helperDeltaQuat = new THREE.Quaternion();
const helperCameraTarget = new THREE.Vector3();
const helperCameraPos = new THREE.Vector3();

// Physics constants
const WING_SPAN = 52; // meters
const MAX_SPEED = 55; // m/s
const MAX_ALTITUDE = 4200; // meters
const GRAVITY = 9.81; // m/s^2
const ANGL_ACCELERATION_RATE = 2.0;        // rad/s²
const ANG_DAMP_RATE = 3.0;    // per second
const THRUST_SCALE = 10.0;    // acceleration = forward * throttle * 10
const LIFT_FACTOR = 0.003;
const DRAG_COEFFICIENT = 0.01;  // drag per second

// for State
let velocity = new THREE.Vector3(-20, 0, 0);
let angularVelocity = new THREE.Vector3(0, 0, 0); // pitch (x), yaw (y), roll (z)
let throttle = 0.5; // range [0,1]

// for shadows
const SHADOW_MAP_SIZE = 4096;
const SHADOW_CAMERA_NEAR = 500;
const SHADOW_CAMERA_FAR = 6000;
const SHADOW_BOX_MIN = 500;
const SHADOW_BOX_MAX = 10000;

//lights
const sunDirectionalLight = new THREE.DirectionalLight(0xffffff, 5.0);
const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
const moonDirectionalLight = new THREE.DirectionalLight(0xF4F4F8, 0.5);

// for sky
let dayState = { t:0 };
let tweenStarted = false;
let NIGHT_SPHERE;
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
const helperSunColor = new THREE.Color();
const helperSkyColor = new THREE.Color();

//colors
const colorWhite = new THREE.Color(0xffffff);
const mistyColor = new THREE.Color(0x999999);
const midnight = new THREE.Color(0x000000);    // Black (no light)
const sunrise = new THREE.Color(0xffb366);     // Light Orange
const noon = new THREE.Color(0xffffff);        // White
const sunset = new THREE.Color(0xff8844);      // Deep Orange
const nightSky = new THREE.Color(0x000011);     // Very Dark Blue (almost black)
const daySky = new THREE.Color(0x87b7cb);       // A less saturated sky blue
const noonSky = new THREE.Color(0xadc8d6);      // A less saturated light blue
const sunsetSky = new THREE.Color(0xff8844);    // Orange Sunset
const dawnSky = new THREE.Color(0x3a5a78);      // A dark, grey-blue for pre-sunrise
const SUN_COLOR_KEYFRAMES = [
    { time: 0.0,   color: midnight }, // Midnight
    { time: 0.25,  color: sunrise  }, // Sunrise
    { time: 0.5,   color: noon     }, // Noon
    { time: 0.75,  color: sunset   }, // Sunset
    { time: 1.0,   color: midnight }  // Back to Midnight
];
const SKY_COLOR_KEYFRAMES = [
    { time: 0.0,   color: nightSky  }, // Midnight
    { time: 0.2,   color: nightSky  }, // Stays dark until 20% (0.25 * 0.8)
    { time: 0.225, color: dawnSky   }, // Fades to dawn (0.25 * 0.9)
    { time: 0.25,  color: daySky    }, // Becomes day at sunrise
    { time: 0.5,   color: noonSky   }, // Noon
    { time: 0.65,  color: daySky    }, // Fades back to day (0.5 + 0.25 * 0.6)
    { time: 0.75,  color: sunsetSky }, // Sunset
    { time: 1.0,   color: nightSky  }  // Back to night
];

//for scene
const USE_ORBIT_CONTROLS = true;
document.getElementById('reset')?.addEventListener('click', reset);
window.addEventListener('resize', onWindowResize, false);
const [SCENE, CAMERA, RENDERER, CONTROLLER, SKY] = initScene();


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
const terrainMeshes = []; // Array to hold all terrain meshes
const helperRaycaster = new THREE.Raycaster();
const helperRayDown = new THREE.Vector3(0, -1, 0);

// for airplane
let AIRCRAFT;
let MIXER; // Animation mixer for GLB animations
let CLOCK = new THREE.Clock(); // Clock for animation timing
let propellerAction;

// for reset
const resetEuler = new THREE.Euler();

// textures and materials
const terrainTexture = new THREE.TextureLoader().load(new URL('https://cdn.architextures.org/textures/23/10/grass-none-e6q3dt.jpg', import.meta.url).href);
terrainTexture.wrapS = THREE.RepeatWrapping;
terrainTexture.wrapT = THREE.RepeatWrapping;
terrainTexture.repeat.set( 10, 10 );
const terrainMaterial = new THREE.MeshStandardMaterial({ map: terrainTexture });

// chunks
addTerrainChunk(0, 0);
const planeInitialY = chunkHeights['0,0'][0][0] + 200;


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
    const topIndex = `${x},${y + 1}`;
    const bottomIndex = `${x},${y - 1}`;
    const leftIndex = `${x - 1},${y}`;
    const rightIndex = `${x + 1},${y}`;
    const topEdge = chunkHeights[topIndex] ? extractBottom(chunkHeights[topIndex]) : null;
    const bottomEdge = chunkHeights[bottomIndex] ? extractTop(chunkHeights[bottomIndex]) : null;
    const leftEdge = chunkHeights[leftIndex] ? extractRight(chunkHeights[leftIndex]) : null;
    const rightEdge = chunkHeights[rightIndex] ? extractLeft(chunkHeights[rightIndex]) : null;
    const newTerrain = generateTerrain(6, 6, {
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

    terrainMeshes.push(mesh); // New Line
}


/**
 * Initializes the Three.js scene, camera, renderer, sky, lights, and orbit controls.
 * @returns {[THREE.Scene, THREE.Camera, THREE.WebGLRenderer, OrbitControls, Sky]}
 */
function initScene() {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(120, window.innerWidth / window.innerHeight, 0.1, 10000);
    const {sunPosition, sky} = initializeSky(scene);
    const renderer = new THREE.WebGLRenderer({antialias: true});
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const container = document.getElementById('container');
    container.appendChild(renderer.domElement);
    const controls = initializeOrbitControls(camera, renderer);
    const aircraft = initializeAircraft(scene);
    camera.position.set(25, 206, 0);
    camera.lookAt(camera.position.x, camera.position.y, camera.position.z + 100);
    controls.update();

    initializeLights(scene, sunPosition, sky);
    initializeNightSphere(scene);

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
    scene.add(ambientLight);

    sunDirectionalLight.castShadow = true;
    sunDirectionalLight.shadow.mapSize.width = SHADOW_MAP_SIZE;
    sunDirectionalLight.shadow.mapSize.height = SHADOW_MAP_SIZE;
    sunDirectionalLight.shadow.camera.near = SHADOW_CAMERA_NEAR;
    sunDirectionalLight.shadow.camera.far = SHADOW_CAMERA_FAR;
    sunDirectionalLight.position.copy(sunPosition);

    scene.add(sunDirectionalLight);
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

/** initialize a night sphere to be used for night sky
 * @param {THREE.Scene} scene - Scene to attach the night sphere.
 * */
function initializeNightSphere(scene) {
    const geometry = new THREE.SphereGeometry(9000, 32, 32);
    const material = new THREE.MeshBasicMaterial({
        color: 0x000011,
        transparent: true,
        opacity: 0,
        side: THREE.BackSide,
        depthWrite: false
    });
    NIGHT_SPHERE = new THREE.Mesh(geometry, material);
    scene.add(NIGHT_SPHERE);
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
    scene.fog = new THREE.FogExp2('white', 0.0009);
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
        AIRCRAFT.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        })
        object.children[0].rotation.z = -Math.PI / 2;
        const box = new THREE.Box3().setFromObject(object);
        const size = new THREE.Vector3();
        box.getSize(size);
        const scaleFactor = WING_SPAN / size.x;
        object.scale.setScalar(scaleFactor);
        object.position.set(0, planeInitialY, 0);
        if (velocity.length() > 0.0001) {
            const desiredDir = velocity.clone().normalize();
            const modelForward = new THREE.Vector3(-1, 0, 0);
            const quat = new THREE.Quaternion().setFromUnitVectors(modelForward, desiredDir);
            object.quaternion.copy(quat);
        }
        if (gltf.animations && gltf.animations.length > 0) {
            MIXER = new THREE.AnimationMixer(object);
            gltf.animations.forEach((clip) => {
                const action = MIXER.clipAction(clip);
                action.play();
                if (clip.name === 'Scene') {
                    propellerAction = action;
                }
            });
        }
        scene.add(object);
    });
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

    if (AIRCRAFT) {
        const lightDist = 1000;
        SKY.userData.sunLight.position.copy(AIRCRAFT.position).addScaledVector(sunPosition, lightDist);
        SKY.userData.sunLight.target.position.copy(AIRCRAFT.position);
        SKY.userData.moonLight.position.copy(AIRCRAFT.position).addScaledVector(sunPosition, -lightDist);
        SKY.userData.moonLight.target.position.copy(AIRCRAFT.position);
    }
    SKY.material.uniforms.sunPosition.value.copy(sunPosition);
    const sunIntensity = Math.max(0, Math.cos(phi));
    const moonIntensity = Math.max(0, -Math.cos(phi));
    const sunBoxSize = THREE.MathUtils.lerp(SHADOW_BOX_MAX, SHADOW_BOX_MIN, sunIntensity);

    const sunShadowCam = SKY.userData.sunLight.shadow.camera;
    sunShadowCam.left = -sunBoxSize;
    sunShadowCam.right = sunBoxSize;
    sunShadowCam.top = sunBoxSize;
    sunShadowCam.bottom = -sunBoxSize;
    sunShadowCam.updateProjectionMatrix();

    const moonBoxSize = THREE.MathUtils.lerp(SHADOW_BOX_MAX, SHADOW_BOX_MIN, moonIntensity);
    const moonShadowCam = SKY.userData.moonLight.shadow.camera;
    moonShadowCam.left = -moonBoxSize;
    moonShadowCam.right = moonBoxSize;
    moonShadowCam.top = moonBoxSize;
    moonShadowCam.bottom = -moonBoxSize;
    moonShadowCam.updateProjectionMatrix();

    return { phi, sunIntensity, moonIntensity, sunPosition };
}

/**
 * Finds the correct color blend from a keyframe array based on time.
 * Modifies the 'targetColor' object in place.
 * @param {THREE.Color} targetColor - The THREE.Color object to modify (e.g., helperSunColor).
 * @param {number} t - The current time (0.0 to 1.0).
 * @param {Array<object>} keyframes - An array of {time, color} objects, sorted by time.
 */
function getInterpolatedColor(targetColor, t, keyframes) {
    for (let i = 1; i < keyframes.length; i++) {
        const prevFrame = keyframes[i - 1];
        const nextFrame = keyframes[i];
        if (t <= nextFrame.time) {
            const segmentDuration = nextFrame.time - prevFrame.time;
            if (segmentDuration === 0) {
                targetColor.copy(prevFrame.color);
                return;
            }
            const timeInSegment = t - prevFrame.time;
            const progress = timeInSegment / segmentDuration;
            targetColor.copy(prevFrame.color);
            targetColor.lerp(nextFrame.color, progress);
            return;
        }
    }
    targetColor.copy(keyframes[keyframes.length - 1].color);
}

/**
 * Updates sun and sky colors based on time using keyframe data.
 */
function updateSkyColors(t) {
    getInterpolatedColor(helperSunColor, t, SUN_COLOR_KEYFRAMES);
    getInterpolatedColor(helperSkyColor, t, SKY_COLOR_KEYFRAMES);
    return { sunColor: helperSunColor, skyColor: helperSkyColor };
}

/**
 * Updates the lighting in the scene based on sun and moon positions and colors.
 * **/
function updateLighting(phi, sunIntensity, moonIntensity, sunColor, skyColor) {
    const sunLight = SKY.userData.sunLight;
    const moonLight = SKY.userData.moonLight;
    const ambient = SCENE.children.find(obj => obj.isAmbientLight);
    sunLight.intensity = THREE.MathUtils.lerp(0.0, 1.5, sunIntensity);
    moonLight.intensity = THREE.MathUtils.lerp(0.0, 0.1, moonIntensity);
    ambient && (ambient.intensity = THREE.MathUtils.lerp(0.0, 0.5, sunIntensity));
    sunLight.color.copy(sunColor);
    moonLight.color.copy(colorWhite);
    ambient && ambient.color.copy(colorWhite);
    SCENE.background = skyColor;
    SCENE.fog.color.copy(skyColor).lerp(mistyColor, moonIntensity);

    // Update the night sphere
    if (NIGHT_SPHERE && AIRCRAFT) {
        NIGHT_SPHERE.material.opacity = THREE.MathUtils.clamp(1 - sunIntensity * 2, 0, 0.95);
        NIGHT_SPHERE.material.color.copy(SCENE.fog.color);
        NIGHT_SPHERE.position.copy(AIRCRAFT.position);
    }

    const shadowCam = sunLight.shadow.camera;
    const boxSize = THREE.MathUtils.lerp(6000, 500, sunIntensity);
    shadowCam.left = -boxSize;
    shadowCam.right = boxSize;
    shadowCam.top = boxSize;
    shadowCam.bottom = -boxSize;
    shadowCam.updateProjectionMatrix();
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



function updatePlanePhysics(plane, camera, input, deltaTime) {

    if (input.w) angularVelocity.z +=  -ANGL_ACCELERATION_RATE * deltaTime; // pitch up
    if (input.s) angularVelocity.z += +ANGL_ACCELERATION_RATE * deltaTime; // pitch down
    if (input.d) angularVelocity.x +=  -ANGL_ACCELERATION_RATE * deltaTime; // roll right
    if (input.a) angularVelocity.x += ANGL_ACCELERATION_RATE * deltaTime; // roll left
    if (input.q) angularVelocity.y +=  -ANGL_ACCELERATION_RATE * deltaTime; // yaw left
    if (input.e) angularVelocity.y += ANGL_ACCELERATION_RATE * deltaTime; // yaw right
    if (input['Shift']) throttle = Math.min(1, throttle + deltaTime); // throttle up
    if (input['Control'])  throttle = Math.max(0, throttle - deltaTime); // throttle down
    if (input[" "]) throttle = Math.max(0, throttle - 3 * deltaTime); // throttle down

    const damp = Math.max(0, 1 - ANG_DAMP_RATE * deltaTime);
    angularVelocity.multiplyScalar(damp);

    helperForward.set(-1, 0, 0).applyQuaternion(plane.quaternion).normalize();
    helperUp.set(0, 1, 0).applyQuaternion(plane.quaternion).normalize();

    helperAcceleration.copy(helperForward).multiplyScalar(throttle * THRUST_SCALE);
    helperAcceleration.y += -GRAVITY;

    helperHorizontalVel.set(velocity.x, 0, velocity.z);
    const horizontalSpeed = helperHorizontalVel.length();

    const lift = LIFT_FACTOR * horizontalSpeed ** 2;

    helperAcceleration.addScaledVector(helperUp, lift);
    velocity.addScaledVector(helperAcceleration, deltaTime);

    velocity.multiplyScalar(1 - DRAG_COEFFICIENT * deltaTime);

    const speed = velocity.length();
    if (speed > MAX_SPEED) velocity.multiplyScalar(MAX_SPEED / speed);

    plane.position.addScaledVector(velocity, deltaTime);
    plane.position.y = Math.min(plane.position.y, MAX_ALTITUDE);

    helperDeltaEuler.set(
        angularVelocity.x * deltaTime,
        angularVelocity.y * deltaTime,
        angularVelocity.z * deltaTime,
        'XYZ'
    );
    helperDeltaQuat.setFromEuler(helperDeltaEuler);
    plane.quaternion.multiply(helperDeltaQuat).normalize();

    const cameraDistance = 35;
    const cameraHeight = 15;
    helperCameraTarget.copy(plane.position);
    helperCameraPos.copy(helperCameraTarget)
        .addScaledVector(helperForward, -cameraDistance)
        .addScaledVector(helperUp, cameraHeight);

    camera.position.lerp(helperCameraPos, 0.1);
    camera.lookAt(helperCameraTarget);
}

const input = {};
window.addEventListener('keydown', e => {input[e.key] = true;});
window.addEventListener('keyup', e => {input[e.key] = false;});

/**
 * Main animation loop.
 */
function animate() {
    requestAnimationFrame(animate);
    const delta = CLOCK.getDelta();
    updateAnimations(delta);
    updateAircraftState(delta);
    updateScene();
    updateGUI();
}
animate();


/**
 * Updates all model animations (propeller, etc.).
 */
function updateAnimations(delta) {
    if (MIXER) {
        MIXER.update(delta);
    }
    if (propellerAction) {
        propellerAction.timeScale = throttle;
    }
}

/**
 * Handles all aircraft state logic (flying, landed, or takeoff).
 */
function updateAircraftState(delta) {
    if (!AIRCRAFT) return;
    if (isLanded) {
        handleLandedLogic();
    } else {
        handleFlyingLogic(delta);
    }
    if (USE_ORBIT_CONTROLS) {
        CONTROLLER.target.copy(AIRCRAFT.position);
    }
}

/**
 * Logic for when the plane is stationary on the ground.
 */
function handleLandedLogic() {
    velocity.set(0, 0, 0);
    angularVelocity.set(0, 0, 0);
}

/**
 * Logic for when the plane is in the air.
 */
function handleFlyingLogic(delta) {
    updatePlanePhysics(AIRCRAFT, CAMERA, input, delta);
    checkTerrainUpdate();
    if (checkCollision()) {
        handleCollision();
    }
}

/**
 * Called when a collision is detected; determines if it's a crash or landing.
 */
function handleCollision() {
    // Get plane's orientation (helperForward/helperUp were set in updatePlanePhysics)
    const upY = helperUp.y;
    const forwardY = Math.abs(helperForward.y);
    // Check for crash conditions
    const isRolledTooMuch = upY < Math.cos(MAX_LANDING_ROLL);
    const isPitchedTooMuch = forwardY > Math.sin(MAX_LANDING_PITCH);
    const isTooFastVertically = velocity.y < MAX_LANDING_SPEED_Y;

    if (isRolledTooMuch || isPitchedTooMuch || isTooFastVertically) {
        reset(); //crash
    } else {
        performLanding();
    }
}

/**
 * Executes the "landing" sequence.
 */
function performLanding() {
    isLanded = true;
    velocity.set(0, 0, 0);
    angularVelocity.set(0, 0, 0);
    // Snap plane to be perfectly level on the ground
    const terrainHeight = getTerrainHeightAt(AIRCRAFT.position.x, AIRCRAFT.position.z);
    // Snap the plane origin so the GEAR is at the terrain height
    AIRCRAFT.position.y = terrainHeight - LANDING_GEAR_Y_OFFSET;
    // Level out roll and pitch
    resetEuler.setFromQuaternion(AIRCRAFT.quaternion, 'YXZ');
    resetEuler.x = 0; // Level pitch
    resetEuler.z = 0; // Level roll
    AIRCRAFT.quaternion.setFromEuler(resetEuler);
}

/**
 * Updates the sky, controls, and renders the scene.
 */
function updateScene() {
    updateSky();
    CONTROLLER.update();
    RENDERER.render(SCENE, CAMERA);
}

/**
 * Updates the HTML GUI elements.
 */
function updateGUI() {
    if (!AIRCRAFT) {
        GUI_ELEMENTS.speed.textContent = 'Loading...';
        GUI_ELEMENTS.altitude.textContent = 'Loading...';
        return;
    }
    const speed = velocity.length();
    console.log("speed " + speed)
    GUI_ELEMENTS.speed.textContent = `${speed.toFixed(2)}`;
    GUI_ELEMENTS.altitude.textContent = `${AIRCRAFT ? AIRCRAFT.position.y.toFixed(2) : 'N/A'}  (${isLanded ? 'Landed' : 'Flying'})`;
}


function onWindowResize() {
    CAMERA.aspect = window.innerWidth / window.innerHeight;
    RENDERER.setSize(window.innerWidth, window.innerHeight);
}


/**
 * Gets the interpolated terrain height at a specific world (x, z) coordinate.
 * Reads from the chunkHeights data array and performs bilinear interpolation.
 * @param {number} worldX - The world-space X coordinate.
 * @param {number} worldZ - The world-space Z coordinate.
 * @returns {number} The interpolated height, or 0 if the chunk isn't loaded.
 */
function getTerrainHeightAt(worldX, worldZ) {
    // Set raycaster to shoot down from high above the plane's center
    helperCollisionPoint.set(worldX, MAX_ALTITUDE, worldZ);
    helperRaycaster.set(helperCollisionPoint, helperRayDown);

    const intersects = helperRaycaster.intersectObjects(terrainMeshes);
    if (intersects.length > 0) {
        return intersects[0].point.y; // Return the exact Y-value of the hit
    }
    return 0; // No ground found
}

/**
 * Check for collision with terrain using a 2-phase check.
 * Phase 1: Simple check of aircraft center.
 * Phase 2: Detailed 36-point check if close.
 */
function checkCollision() {
    AIRCRAFT.updateWorldMatrix(true, false);
    helperAircraftMatrix.copy(AIRCRAFT.matrixWorld);
    for (let i = 0; i < AIRCRAFT_SAMPLE_POINTS_X.length; i++) {
        for (let j = 0; j < AIRCRAFT_SAMPLE_POINTS_Z.length; j++) {
            helperCollisionPoint.set(
                AIRCRAFT_SAMPLE_POINTS_X[i],
                LANDING_GEAR_Y_OFFSET,
                AIRCRAFT_SAMPLE_POINTS_Z[j]
            );
            helperCollisionPoint.applyMatrix4(helperAircraftMatrix);
            helperRaycaster.set(helperCollisionPoint, helperRayDown);
            const intersects = helperRaycaster.intersectObjects(terrainMeshes);
            if (intersects.length > 0) {
                const distance = intersects[0].distance;
                if (distance < LANDING_THRESHOLD) {
                    return true; // Landed or crashed
                }
            }
        }
    }
    // We checked all 36 points and none are touching
    return false;
}


/**
 * Reset the scene back to default
 * */
function reset() {
    velocity.set(-20, 0, 0);
    angularVelocity.set(0, 0, 0);
    throttle = 0.5;
    AIRCRAFT.position.y = planeInitialY;
    isLanded = false;

    resetEuler.setFromQuaternion(AIRCRAFT.quaternion, 'YXZ');
    resetEuler.x = 0;
    resetEuler.z = 0;
    AIRCRAFT.quaternion.setFromEuler(resetEuler);

    if (USE_ORBIT_CONTROLS) {
        CONTROLLER.target.copy(AIRCRAFT.position);
    }
}