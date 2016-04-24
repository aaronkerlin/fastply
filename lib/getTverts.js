'use strict'

var bits = require('bit-twiddle')
var pool = require('typedarray-pool')
var ops = require('ndarray-ops')
var ndarray = require('ndarray')
var gradient = require('ndarray-gradient')

var SURFACE_VERTEX_SIZE = 4 * (4 + 3 + 3)


var QUAD = [
  [0, 0],
  [0, 1],
  [1, 0],
  [1, 1],
  [1, 0],
  [0, 1]
]

function padField (nfield, field) {
  var shape = field.shape.slice()
  var nshape = nfield.shape.slice()

  // Center
  ops.assign(nfield.lo(1, 1).hi(shape[0], shape[1]), field)

  // Edges
  ops.assign(nfield.lo(1).hi(shape[0], 1),
    field.hi(shape[0], 1))
  ops.assign(nfield.lo(1, nshape[1] - 1).hi(shape[0], 1),
    field.lo(0, shape[1] - 1).hi(shape[0], 1))
  ops.assign(nfield.lo(0, 1).hi(1, shape[1]),
    field.hi(1))
  ops.assign(nfield.lo(nshape[0] - 1, 1).hi(1, shape[1]),
    field.lo(shape[0] - 1))
  // Corners
  nfield.set(0, 0, field.get(0, 0))
  nfield.set(0, nshape[1] - 1, field.get(0, shape[1] - 1))
  nfield.set(nshape[0] - 1, 0, field.get(shape[0] - 1, 0))
  nfield.set(nshape[0] - 1, nshape[1] - 1, field.get(shape[0] - 1, shape[1] - 1))
}

function getTverts(surface, params) {
  
  params = params || {}

  var field;
  var i;
  var j;
  if (surface._field[2].shape[0] || surface._field[2].shape[2]) {
      field = surface._field[2].lo(1, 1).hi(surface._field[2].shape[0] - 2, surface._field[2].shape[1] - 2)
    } else {
      field = surface._field[2].hi(0, 0)
  }
    // Save shape
    var fields = surface._field

    // Save shape of field
  var shape = field.shape.slice()

  var count = (shape[0] - 1) * (shape[1] - 1) * 6
  var tverts = pool.mallocFloat(bits.nextPow2(10 * count))


  // Compute surface normals
  var dfields = ndarray(pool.mallocFloat(fields[2].size * 3 * 2), [3, shape[0] + 2, shape[1] + 2, 2])
  for (i = 0; i < 3; ++i) {
    gradient(dfields.pick(i), fields[i], 'mirror')
  }
  var normals = ndarray(pool.mallocFloat(fields[2].size * 3), [shape[0] + 2, shape[1] + 2, 3])
  for (i = 0; i < shape[0] + 2; ++i) {
    for (j = 0; j < shape[1] + 2; ++j) {
      var dxdu = dfields.get(0, i, j, 0)
      var dxdv = dfields.get(0, i, j, 1)
      var dydu = dfields.get(1, i, j, 0)
      var dydv = dfields.get(1, i, j, 1)
      var dzdu = dfields.get(2, i, j, 0)
      var dzdv = dfields.get(2, i, j, 1)

      var nx = dydu * dzdv - dydv * dzdu
      var ny = dzdu * dxdv - dzdv * dxdu
      var nz = dxdu * dydv - dxdv * dydu

      var nl = Math.sqrt(nx * nx + ny * ny + nz * nz)
      if (nl < 1e-8) {
        nl = Math.max(Math.abs(nx), Math.abs(ny), Math.abs(nz))
        if (nl < 1e-8) {
          nz = 1.0
          ny = nx = 0.0
          nl = 1.0
        } else {
          nl = 1.0 / nl
        }
      } else {
        nl = 1.0 / Math.sqrt(nl)
      }

      normals.set(i, j, 0, nx * nl)
      normals.set(i, j, 1, ny * nl)
      normals.set(i, j, 2, nz * nl)
    }
  }
  pool.free(dfields.data)

  // Initialize surface
  var lo = [ Infinity, Infinity, Infinity ]
  var hi = [ -Infinity, -Infinity, -Infinity ]
  var lo_intensity = Infinity
  var hi_intensity = -Infinity

  var tptr = 0
  var vertexCount = 0
  for (i = 0; i < shape[0] - 1; ++i) {
    j_loop:
    for (j = 0; j < shape[1] - 1; ++j) {
      // Test for NaNs
      for (var dx = 0; dx < 2; ++dx) {
        for (var dy = 0; dy < 2; ++dy) {
          for (var k = 0; k < 3; ++k) {
            var f = surface._field[k].get(1 + i + dx, 1 + j + dy)
            if (isNaN(f) || !isFinite(f)) {
              continue j_loop
            }
          }
        }
      }
      for (k = 0; k < 6; ++k) {
        var r = i + QUAD[k][0]
        var c = j + QUAD[k][1]

        var tx = surface._field[0].get(r + 1, c + 1)
        var ty = surface._field[1].get(r + 1, c + 1)
        f = surface._field[2].get(r + 1, c + 1)
        var vf = f
        nx = normals.get(r + 1, c + 1, 0)
        ny = normals.get(r + 1, c + 1, 1)
        nz = normals.get(r + 1, c + 1, 2)

        if (params.intensity) {
          vf = params.intensity.get(r, c)
        }

        tverts[tptr++] = r
        tverts[tptr++] = c
        tverts[tptr++] = tx
        tverts[tptr++] = ty
        tverts[tptr++] = f
        tverts[tptr++] = 0
        tverts[tptr++] = vf
        tverts[tptr++] = nx
        tverts[tptr++] = ny
        tverts[tptr++] = nz

        lo[0] = Math.min(lo[0], tx)
        lo[1] = Math.min(lo[1], ty)
        lo[2] = Math.min(lo[2], f)
        lo_intensity = Math.min(lo_intensity, vf)

        hi[0] = Math.max(hi[0], tx)
        hi[1] = Math.max(hi[1], ty)
        hi[2] = Math.max(hi[2], f)
        hi_intensity = Math.max(hi_intensity, vf)

        vertexCount += 1
      }
    }
  }

  if (params.intensityBounds) {
    lo_intensity = +params.intensityBounds[0]
    hi_intensity = +params.intensityBounds[1]
  }

  // Scale all vertex intensities
  for (i = 6; i < tptr; i += 10) {
    tverts[i] = (tverts[i] - lo_intensity) / (hi_intensity - lo_intensity)
  }

  pool.free(normals.data)
  return tverts
}

module.exports = getTverts;
