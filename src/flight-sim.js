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
// import { generateTerrain, extractTop, extractBottom, extractLeft, extractRight } from './terrain-generation.js';
//
// const WING_SPAN = 11; // meters
// const MAX_SPEED = 55; // m/s
// const MAX_ALTITUDE = 4200; // meters
// const GRAVITY = 9.81; // m/s^2
// const SQUARE_SIZE = 2000; // meters

//for scene 
const USE_ORBIT_CONTROLS = true;
const DEBUG = false;
const [SCENE, CAMERA, RENDERER, CONTROLLER, SKY] = initScene();

// for sky
let sunAngle = 180;
let sunState = { phiDeg: 0 };
let tweenStarted = false;

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
    sunDirectionalLight.position.copy(sunPosition);
    scene.add(sunDirectionalLight);

    sky.userData.sunLight = sunDirectionalLight;
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
    return { sunPosition, sky };
}

/**
 * Creates a mock aircraft
 * @param {THREE.Scene} scene - Scene to attach the aircraft
 * @return aircraft
 * */
function initializeAircraft(scene) {
    const aircraft = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3333ff });
    const wingMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
    const tailMat = new THREE.MeshStandardMaterial({ color: 0x777777 });
    const cockpitMat = new THREE.MeshStandardMaterial({ color: 0x87ceeb, transparent: true, opacity: 0.6 });
    const propMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const fuselage = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 1, 8, 16),
        bodyMat
    );
    fuselage.rotation.z = Math.PI / 2;
    aircraft.add(fuselage);

    const cockpit = new THREE.Mesh(
        new THREE.SphereGeometry(0.9, 16, 16),
        cockpitMat
    );
    cockpit.position.set(4, 0.3, 0);
    aircraft.add(cockpit);

    const leftWing = new THREE.Mesh(
        new THREE.BoxGeometry(6, 0.1, 1),
        wingMat
    );
    leftWing.position.set(0, 0, -1.5);
    aircraft.add(leftWing);

    const rightWing = leftWing.clone();
    rightWing.position.z = 1.5;
    aircraft.add(rightWing);

    const tailLeft = new THREE.Mesh(
        new THREE.BoxGeometry(2, 0.05, 0.5),
        tailMat
    );
    tailLeft.position.set(-3.5, 0.2, -0.5);
    aircraft.add(tailLeft);

    const tailRight = tailLeft.clone();
    tailRight.position.z = 0.5;
    aircraft.add(tailRight);

    const tailFin = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 1, 0.5),
        tailMat
    );
    tailFin.position.set(-3.5, 0.7, 0);
    aircraft.add(tailFin);

    const propHub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 0.2, 12),
        propMat
    );
    propHub.rotation.z = Math.PI / 2;
    propHub.position.set(4.3, 0, 0);
    aircraft.add(propHub);
    const blade1 = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 2, 0.05),
        propMat
    );
    blade1.position.set(4.4, 0, 0);
    aircraft.add(blade1);

    const blade2 = blade1.clone();
    blade2.rotation.x = Math.PI / 2;

    aircraft.add(blade2);
    aircraft.userData.propeller = [blade1, blade2];
    aircraft.scale.set(0.5, 0.5, 0.5);
    aircraft.position.set(0, 0, 0);

    if(!DEBUG) {
        scene.add(aircraft);
    }

    return aircraft;
}

/**
 * Updates the sun's position over time to simulate a moving sky.
 */
function updateSky() {
    if (DEBUG) {
        sunState.phiDeg = sunAngle;
    } else {
        if (!tweenStarted) {
            new TWEEN.Tween(sunState)
                .to({ phiDeg: 360 }, 60000)
                .onUpdate(() => {})
                .repeat(Infinity)
                .start();
            tweenStarted = true;
        }
        TWEEN.update();
    }
    const theta = THREE.MathUtils.degToRad(180);
    const phi = THREE.MathUtils.degToRad(180 - sunState.phiDeg);
    const sunPosition = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    SKY.material.uniforms.sunPosition.value.copy(sunPosition);
    SKY.userData.sunLight.position.copy(sunPosition);
    SKY.userData.sunLight.lookAt(0, 0, 0);
    SKY.userData.sunLight.intensity = Math.max(0, Math.cos(phi));
}


// /**
//  * Update Fog Color based on sky
//  * */
// function updateFogColor() {
//
// }



/**
 * Animation loop: updates sky, orbit controls, and renders each frame.
 * @returns {void}
 */
function animate() {
    requestAnimationFrame(animate);
    updateSky();
    CONTROLLER.update();
    RENDERER.render(SCENE, CAMERA);
}
animate();

// /**
//  * Reset the scene back to default
//  * */
// function reset() {
//
// }