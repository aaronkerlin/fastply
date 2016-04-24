/**
* Copyright 2012-2016, Plotly, Inc.
* All rights reserved.
*
* This source code is licensed under the MIT license found in the
* LICENSE file in the root directory of this source tree.
*/


'use strict';

var ndarray = require('ndarray');
var homography = require('ndarray-homography');
var fill = require('ndarray-fill');
var ops = require('ndarray-ops');

var MIN_RESOLUTION = 128;

// Pad coords by +1
function padField(field) {
    var shape = field.shape;
    var nshape = [shape[0]+2, shape[1]+2];
    var nfield = ndarray(new Float32Array(nshape[0] * nshape[1]), nshape);

    // Center
    ops.assign(nfield.lo(1, 1).hi(shape[0], shape[1]), field);

    // Edges
    ops.assign(nfield.lo(1).hi(shape[0], 1),
                field.hi(shape[0], 1));
    ops.assign(nfield.lo(1, nshape[1]-1).hi(shape[0], 1),
                field.lo(0, shape[1]-1).hi(shape[0], 1));
    ops.assign(nfield.lo(0, 1).hi(1, shape[1]),
                field.hi(1));
    ops.assign(nfield.lo(nshape[0]-1, 1).hi(1, shape[1]),
                field.lo(shape[0]-1));

    // Corners
    nfield.set(0, 0, field.get(0, 0));
    nfield.set(0, nshape[1]-1, field.get(0, shape[1]-1));
    nfield.set(nshape[0]-1, 0, field.get(shape[0]-1, 0));
    nfield.set(nshape[0]-1, nshape[1]-1, field.get(shape[0]-1, shape[1]-1));

    return nfield;
}

function getIntensity(trace) {
        var data = trace.data;
        var surface = trace.surface;
        var z = data.z;
        var xlen = z[0].length;
        var ylen = z.length;
        var scaleF = trace.dataScale;
        var intensity = ndarray(new Float32Array(xlen * ylen), [xlen, ylen]);

        fill(intensity, function(row, col) {
            return data.surfacecolor[col][row];
        });
        var padImg = padField(intensity);
        var scaledImg = ndarray(new Float32Array(surface.intensity.size), surface.intensity.shape);
        homography(scaledImg, padImg, [scaleF, 0, 0,
                                              0, scaleF, 0,
                                              0, 0, 1]);
        
        return scaledImg
}

module.exports = getIntensity;


