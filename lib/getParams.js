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
var tinycolor = require('tinycolor2');

var MIN_RESOLUTION = 128;

function parseColorScale(colorscale, alpha) {
    if(alpha === undefined) alpha = 1;

    return colorscale.map(function(elem) {
        var index = elem[0];
        var color = tinycolor(elem[1]);
        var rgb = color.toRgb();
        return {
            index: index,
            rgb: [rgb.r, rgb.g, rgb.b, alpha]
        };
    });
}

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

function refine(coords) {
    var minScale = Math.max(coords[0].shape[0], coords[0].shape[1]);

    if(minScale < MIN_RESOLUTION) {
        var scaleF = MIN_RESOLUTION / minScale;
        var nshape = [
            Math.floor((coords[0].shape[0]) * scaleF+1)|0,
            Math.floor((coords[0].shape[1]) * scaleF+1)|0 ];
        var nsize = nshape[0] * nshape[1];

        for(var i = 0; i < coords.length; ++i) {
            var padImg = padField(coords[i]);
            var scaledImg = ndarray(new Float32Array(nsize), nshape);
            homography(scaledImg, padImg, [scaleF, 0, 0,
                                              0, scaleF, 0,
                                              0, 0, 1]);
            coords[i] = scaledImg;
        }

        return scaleF;
    }

    return 1.0;
}

function getParams(trace) {
    var i,
        scene = trace.scene,
        surface = trace.surface,
        data = trace.data,
        sceneLayout = scene.fullSceneLayout,
        alpha = data.opacity,
        colormap = parseColorScale(data.colorscale, alpha),
        z = data.z,
        x = data.x,
        y = data.y,
        xaxis = sceneLayout.xaxis,
        yaxis = sceneLayout.yaxis,
        zaxis = sceneLayout.zaxis,
        scaleFactor = scene.dataScale,
        xlen = z[0].length,
        ylen = z.length,
        coords = [
            ndarray(new Float32Array(xlen * ylen), [xlen, ylen]),
            ndarray(new Float32Array(xlen * ylen), [xlen, ylen]),
            ndarray(new Float32Array(xlen * ylen), [xlen, ylen])
        ],
        xc = coords[0],
        yc = coords[1],
        contourLevels = scene.contourLevels;
    /*
     * Fill and transpose zdata.
     * Consistent with 'heatmap' and 'contour', plotly 'surface'
     * 'z' are such that sub-arrays correspond to y-coords
     * and that the sub-array entries correspond to a x-coords,
     * which is the transpose of 'gl-surface-plot'.
     */
    fill(coords[2], function(row, col) {
        return zaxis.d2l(z[col][row]) * scaleFactor[2];
    });

    // coords x
    if(Array.isArray(x[0])) {
        fill(xc, function(row, col) {
            return xaxis.d2l(x[col][row]) * scaleFactor[0];
        });
    } else {
        // ticks x
        fill(xc, function(row) {
            return xaxis.d2l(x[row]) * scaleFactor[0];
        });
    }

    // coords y
    if(Array.isArray(y[0])) {
        fill(yc, function(row, col) {
            return yaxis.d2l(y[col][row]) * scaleFactor[1];
        });
    } else {
        // ticks y
        fill(yc, function(row, col) {
            return yaxis.d2l(y[col]) * scaleFactor[1];
        });
    }

    var params = {
        colormap: colormap,
        levels: [[], [], []],
        showContour: [true, true, true],
        showSurface: !data.hidesurface,
        contourProject: [
            [false, false, false],
            [false, false, false],
            [false, false, false]
        ],
        contourWidth: [1, 1, 1],
        contourColor: [[1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1]],
        contourTint: [1, 1, 1],
        dynamicColor: [[1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1]],
        dynamicWidth: [1, 1, 1],
        dynamicTint: [1, 1, 1],
        opacity: 1
    };

    params.intensityBounds = [data.cmin, data.cmax];

    //Refine if necessary
    if(data.surfacecolor) {
        var intensity = ndarray(new Float32Array(xlen * ylen), [xlen, ylen]);

        fill(intensity, function(row, col) {
            return data.surfacecolor[col][row];
        });

        coords.push(intensity);
    }
    else {
        // when 'z' is used as 'intensity',
        // we must scale its value
        params.intensityBounds[0] *= scaleFactor[2];
        params.intensityBounds[1] *= scaleFactor[2];
    }

    if(data.surfacecolor) {
        params.intensity = coords.pop();
    }

    if('opacity' in data) {
        if(data.opacity < 1) {
            params.opacity = 0.25 * data.opacity;
        }
    }

    params.coords = coords;

    return params
};

module.exports = getParams;

