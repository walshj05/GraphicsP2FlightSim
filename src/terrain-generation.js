/**
 * Code for generating terrain-like height maps using the square-diamond
 * algorithm. The generated terrain can be used to create a THREE.Geometry
 * object for rendering the terrain, although it likely needs to be scaled and
 * positioned to fit the scene.
 */

/**
 * Generates random terrain using the square-diamond algorithm and median filtering.
 * 
 * Parameters:
 *     detail - The log-base2 of the size of the returned 2D data
 *              (likely at most 7 for a 128x128 array of floats, or ~16,000 total values)
 *     roughness - The roughness of the terrain
 *     top - The top row of the terrain data to match to or null is not constrained
 *           (from extractBottom() on an existing terrain)
 *     bottom - The bottom row of the terrain data to match to or null is not constrained
 *              (from extractTop() on an existing terrain)
 *     left - The left column of the terrain data to match to or null is not constrained
 *            (from extractRight() on an existing terrain)
 *     right - The right column of the terrain data to match to or null is not constrained
 *             (from extractLeft() on an existing terrain)
 * 
 * Returns:
 *     A 2D array (array of arrays) that represents a height-map (i.e. each
 *     value is the distance up the ground is, although the distance can be negative).
 */
export function generateTerrain(
    detail, roughness = 1,
    {top = null, bottom = null, left = null, right = null} = {},
) {
    // The actual size of the data must be a power of two in each direction
    const size = Math.pow(2, detail) + 1;
    const max = size - 1;
    const map = new Array(size);
    for (let i = 0; i < size; i++) { map[i] = new Float32Array(size); }

    // Start with random values in the corners
    const scale = roughness*size / 2;
    map[0][0] = top ? top[0] : right ? right[0] : rand(scale);
    map[max][0] = bottom ? bottom[0] : right ? right[max] : rand(scale);
    map[max][max] = bottom ? bottom[max] : left ? left[max] : rand(scale);
    map[0][max] = top ? top[max] : left ? left[0] : rand(scale);

    // Recursively run square-diamond algorithm
    divide(max);
    
    // Apply median 3x3 filter to the map to smooth it a bit
    const smoothed = median3Filter(map);

    // Force the top, bottom, left, and right edges to match the provided values
    // They should be already fairly close, but the median filter may have moved them slightly.
    if (top) { for (let y = 0; y < size; y++) { smoothed[0][y] = top[y]; } }
    if (bottom) { for (let y = 0; y < size; y++) { smoothed[max][y] = bottom[y]; } }
    if (left) { for (let x = 0; x < size; x++) { smoothed[x][max] = left[x]; } }
    if (right) { for (let x = 0; x < size; x++) { smoothed[x][0] = right[x]; } }

    return smoothed;

    function divide(sz) {
        // Recursively divides the map, applying the square-diamond algorithm
        const half = sz / 2, scl = roughness * sz;
        if (half < 1) { return; }

        for (let y = half; y < max; y += sz) {
            for (let x = half; x < max; x += sz) {
                // can never have x = 0 or y = 0 here
                map[x][y] = rand(scl) + square(x, y, half);
            }
        }

        for (let y = 0; y <= max; y += half) {
            for (let x = (y + half) % sz; x <= max; x += sz) {
                map[x][y] = (top && x === 0) ? top[y] :
                    (bottom && x === max) ? bottom[y] :
                        (left && y === max) ? left[x] :
                            (right && y === 0) ? right[x] :
                                rand(scl) + diamond(x, y, half);
            }
        }

        divide(half);
    }

    function square(x, y, sz) {
        // Performs a single square computation of the algorithm
        if (x < sz) { return average(map[x+sz][y-sz], map[x+sz][y+sz]); }
        if (x > max - sz) { return average(map[x+sz][y-sz], map[x+sz][y+sz]); }
        return average(map[x-sz][y-sz], map[x+sz][y-sz], map[x+sz][y+sz], map[x-sz][y+sz]);
    }

    function diamond(x, y, sz) {
        // Performs a single computation step of the algorithm
        if (x < sz) { return average(map[x][y-sz], map[x+sz][y], map[x][y+sz]); }
        if (x > max-sz) { return average(map[x][y-sz], map[x][y+sz], map[x-sz][y]); }
        return average(map[x][y-sz], map[x+sz][y], map[x][y+sz], map[x-sz][y]);
    }
}

/**
 * Extract the top row of the terrain data.
 * @param {Array} terrain - The terrain data
 * @returns {Array} The top row of the terrain data
 */
export function extractTop(terrain) { return terrain[0]; }

/**
 * Extract the bottom row of the terrain data.
 * @param {Array} terrain - The terrain data
 * @returns {Array} The bottom row of the terrain data
 */
export function extractBottom(terrain) { return terrain[terrain.length - 1]; }

/**
 * Extract the left column of the terrain data.
 * @param {Array} terrain - The terrain data
 * @returns {Array} The left column of the terrain data
 */
export function extractLeft(terrain) { return terrain.map(row => row[row.length - 1]); }

/**
 * Extract the right column of the terrain data.
 * @param {Array} terrain - The terrain data
 * @returns {Array} The right column of the terrain data
 */
export function extractRight(terrain) { return terrain.map(row => row[0]); }

/**
 * Generate a random number between -scale and scale
 * @param {number} scale - The scale of the random number
 * @returns {number} The random number
 */
function rand(scale) { return Math.random() * scale * 2 - scale; }

/**
 * Remove undefined values from the array
 * @param {Array} array - The array to filter
 * @returns {Array} The filtered array
 */
function filterUndefined(array) { return array.filter(function (n) { return n === 0 || n; }); }

/**
 * Calculate the average of the values in the array, ignoring undefined values.
 * @param  {...any} array - The array of values to average
 * @returns {number} The average of the values
 */
function average(...array) {
    array = filterUndefined(array);
    return array.reduce((a, b) => a + b, 0) / array.length;
}

/**
 * Calculate the median of the values in the array, ignoring undefined values.
 * @param  {...any} array - The array of values to calculate the median of
 * @returns {number} The median of the values
 */
function median(...array) {
    array = filterUndefined(array);
    array.sort();
    return ((array.length % 2) === 1) ? array[(array.length-1)/2] :
        ((array[array.length/2-1] + array[array.length/2]) / 2);
}
/**
 * Apply a 3x3 median filter to the given array-of-arrays. This is a robust way
 * to smooth the results.
 * @param {Array} src - The array-of-arrays to filter
 * @returns {Array} The filtered array
 */
function median3Filter(src) {
    const N = src.length, n = N - 1;
    const block = new Float32Array(3*3);
    const dst = new Array(N);
    for (let y = 0; y < N; y++) { dst[y] = new Float32Array(N); }
    // Core of the 'image'
    for (let y = 0; y < N-2; y++) {
        for (let x = 0; x < N-2; x++) {
            for (let cy = 0; cy < 3; cy++) {
                for (let cx = 0; cx < 3; cx++) {
                    block[cy*3+cx] = src[y+cy][x+cx];
                }
            }
            block.sort();
            dst[y+1][x+1] = block[4];
        }
    }
    // Corners
    dst[0][0] = median(src[0][0], src[1][0], src[0][1], src[1][1]);
    dst[n][0] = median(src[n][0], src[n][1], src[n-1][0], src[n-1][1]);
    dst[0][n] = median(src[0][n], src[1][n], src[0][n-1], src[1][n-1]);
    dst[n][n] = median(src[n][n], src[n][n-1], src[n-1][n], src[n-1][n-1]);
    // Edges
    for (let y = 1; y < n; y++) {
        dst[y][0] = median(src[y-1][0], src[y][0], src[y+1][0], src[y-1][1], src[y][1], src[y+1][1]);
        dst[y][n] = median(src[y-1][n], src[y][n], src[y+1][n], src[y-1][n-1], src[y][n-1], src[y+1][n-1]);
    }
    for (let x = 1; x < n; x++) {
        dst[0][x] = median(src[0][x-1], src[0][x], src[0][x+1], src[1][x-1], src[1][x], src[1][x+1]);
        dst[n][x] = median(src[n][x-1], src[n][x], src[n][x+1], src[n-1][x-1], src[n-1][x], src[n-1][x+1]);
    }
    // Done
    return dst;
}
