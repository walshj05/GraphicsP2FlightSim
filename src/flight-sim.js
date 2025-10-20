import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { generateTerrain, extractTop, extractBottom, extractLeft, extractRight } from './terrain-generation.js';

const WING_SPAN = 11; // meters
const MAX_SPEED = 55; // m/s
const MAX_ALTITUDE = 4200; // meters
const GRAVITY = 9.81; // m/s^2
const SQUARE_SIZE = 2000; // meters

const USE_ORBIT_CONTROLS = false;
const DEBUG = true;

