var Plotly = require('../lib/plotly-latest.min.js')
var jpickle = require('jpickle')
var getIntensity = require('../lib/getIntensity')
var getParams = require('../lib/getParams')
var getTverts = require('../lib/getTverts')
var jquery = require('jquery')
var dat = require('dat-gui')
var pack = require('ndarray-pack')
var ops = require('ndarray-ops')
var colormap = require('colormap')
var pool = require('typedarray-pool')
var uuid = require('node-uuid')
var WatchJS = require("watchjs")
var watch = WatchJS.watch;
var unwatch = WatchJS.unwatch;
var callWatchers = WatchJS.callWatchers;

var QUAD = [
  [0, 0],
  [0, 1],
  [1, 0],
  [1, 1],
  [1, 0],
  [0, 1]
]

var colormaps = [
        'jet', 'hsv','hot','cool','spring','summer','autumn','winter','bone',
        'copper','greys','YIGnBu','greens','YIOrRd','bluered','RdBu','picnic',
        'rainbow','portland','blackbody','earth','electric'
    ];

var traceIdx,
    intensity,
    count,
    i,
    j,
    k,
    r,
    c,
    axisLims = new Float32Array(2),
    time,
    graphDiv,
    dataArray,
    outputCell,
    binarypath,
    scalars,
    traces,
    ntps,
    fine_range,
    rangeslider,
    idxLength,
    tverts,
    tptr,
    gui,
    shape,
    conf,
    tController,
    guiVars,
    notebookMode = false,
    N_COLORS = 265,
    alphamap,
    delayUpdate,
    busy,
    graphID;

var createSurface4d = function (pathin, element) {
    graphDiv = document.createElement('div');
    graphId =  uuid.v4();
    graphDiv.id = graphId;
    graphDiv.style.width = 85 +'%';
    graphDiv2 = document.createElement('div');
    graphId2 =  uuid.v4();
    graphDiv2.id = graphId2;
    graphDiv2.style.width = 85 +'%';

    if (!element) {
        //append to document
        document.body.appendChild(graphDiv);
        outputCell = graphDiv;
    } else {
        //In notebook
        notebookMode = true
        //append to output cell
        element.append(graphDiv);
        element.append(graphDiv2);
        //Get output DOM
        outputCell = graphDiv.parentNode.parentNode;
        //remove output prompt
        outputCell.removeChild(outputCell.firstElementChild);
    }

    var filePath = pathin;
    jquery.get(filePath,function(fileData){

        //load the data
        var dict = jpickle.loads(fileData);
        try { 
            var test = (('figs' in dict) && ('extendedData' in dict));
        } catch (err) {
            throw "improper dictionary format";
            return
        }

        var fig0  = dict.figs[0];
        var fig1 = dict.figs[1];

        if ('list' in dict.extendedData) {
            dataArray = dict.extendedData.list;
            ntps = dataArray.length;
        } else if ('binarypath' in dict.extendedData) {
            binarypath = dict.extendedData.binarypath;
            ntps = dict.extendedData.maxIdx;
            idxLength = ntps.toString().length;
            getConf();
        } else {
            throw "improper extendedData format";
            return
        }
        if ('fine_range' in dict.extendedData) {
            fine_range = dict.extendedData.fine_range;
        } else {
            fine_range = 50;
        }
        //Plot initial data 
        Plotly.newPlot(graphDiv, data=fig0.data, layout=fig0.layout, {showLink: false});
        Plotly.newPlot(graphDiv2, data=fig1.data, layout=fig1.layout, {showLink: false});
        //console.log(graphDiv2._fullLayout)
        //Collect trace objects and tvert data
        traces = new Array(fig0.data.length);
        var coords = new Array(fig0.data.length);
        tverts = new Array(fig0.data.length);
        var params;
        var trace;
        for (var traceName in graphDiv._fullLayout.scene._scene.traces){
            trace = graphDiv._fullLayout.scene._scene.traces[traceName];
            if ('surface' in trace) { 
                params = getParams(trace);
                coords[trace.data.index] = params.coords;
                intensity = getIntensity(trace);
                params = {coords: coords, intensity: intensity};
                tverts[trace.data.index] = getTverts(trace.surface, params);
                traces[trace.data.index] = trace;
                trace.surface.opacity = Math.min(trace.surface.opacity,0.99);
            }
        }
        //traces[0].scene.fullLayout.title='Hi'
        shape = trace.surface.shape.slice();
        tptr = (shape[0] - 1) * (shape[1] - 1) * 6 * 10;
        //var glplot = trace.scene.glplot;
        graphDiv.onremove = function () {
            trace.scene.destroy(); 
            gui.length=0;
            pool.freeFloat(tverts); 
            tverts.length=0;
            window.fastply.length=0;
        }

        //take defaults from first surface
        guiVars = {time: Math.round(ntps/2),
            loThresh: trace.surface.intensityBounds[0],
            hiThresh:  trace.surface.intensityBounds[1],
            opacity: trace.surface.opacity,
            colormap: 'greys'}

        //Setup GUI
        gui = new dat.GUI({ autoPlace: false })
        outputCell.insertBefore(gui.domElement, outputCell.firstChild);
        
        var displayF = gui.addFolder('3D Display');
        displayF.add(guiVars, 'loThresh').min(-100).max(guiVars.hiThresh).onChange(selectData);
        displayF.add(guiVars, 'hiThresh').min(-100).max(guiVars.hiThresh).onChange(selectData);
        displayF.add(guiVars, 'colormap', colormaps).onChange(changeColormap);
        displayF.add(guiVars, 'opacity').min(0).max(0.99).onChange(changeOpacity);
        
        //dataF = gui.addFolder('Data');
        //dataF.



        jquery(gui.domElement.getElementsByTagName('option')).css('color','#000000')
        jquery(gui.domElement.getElementsByTagName('select')).css('color','#000000')
        //var volF = gui.addFolder('2D Display');
        //drop-down menu for each data type, updates on/off, color, etc options below
        //field and mask selector present but disabled depending on data type
        
        rangeslider = graphDiv2._fullLayout;
        displayF.open();

        axisLims[0] = graphDiv2._fullLayout.xaxis._tmin
        axisLims[1] = graphDiv2._fullLayout.xaxis._tmax

        //Initial recalc based on default settings
        changeColormap();
        selectData();
        changeOpacity();

        console.log(graphDiv._fullLayout)

        watch(graphDiv2, ['_replotting'], function(){
            if (graphDiv2._replotting==false) {
                timeShift(graphDiv2._fullLayout.xaxis._tmin, graphDiv2._fullLayout.xaxis._tmax)
            }
        })

        watch(graphDiv2, ['_dragging'], function(){
            if (graphDiv2._dragging==true) {
                var startTmin = graphDiv2._fullLayout.xaxis._tmin
                var startTmax = graphDiv2._fullLayout.xaxis._tmax
                var xtimeLength = startTmax - startTmin
                var xpixelLength = graphDiv2._fullLayout._plots.xy.plot[0][0].viewBox.animVal.width
                var pixelToTime = xtimeLength/xpixelLength
                var panshift
                var id = setInterval(xShift,33)
                function xShift() {
                    if (graphDiv2._dragging==false) {
                        clearInterval(id)
                    } else {
                        console.log(pixelToTime)
                        panshift = graphDiv2._fullLayout._plots.xy.plot[0][0].viewBox.animVal.x * pixelToTime
                        timeShift(startTmin+panshift, startTmax+panshift) 
                    }
                }
            }
        })

    })
}


function genColormap (name) {
  var x = pack([colormap({
    colormap: name,
    nshades: N_COLORS,
    format: 'rgba',
    alpha: [0,1]
  }).map(function (c) {
    if (c[3]>0.001) {
        c[3] = 1;
    } else {
        c[3]=0;
    }
    return [c[0], c[1], c[2], 255 * c[3]]
  })])
  ops.divseq(x, 255.0)
  return x
}

function timeShift(tmin,tmax){
    guiVars.time = Math.round((tmax + tmin)/2)
    guiVars.time=Math.max(guiVars.time, axisLims[0])
    guiVars.time=Math.min(guiVars.time, axisLims[1])
    selectData()
}


function changeColormap() {
    for (i=0;i<traces.length;i++){
        traces[i].surface._colorMap.setPixels(genColormap(guiVars.colormap));
    }                    
    traces[0].scene.glplot.redraw(); 
}

function changeOpacity() {
    for (i=0;i<traces.length;i++){
        traces[i].surface.opacity = guiVars.opacity;
    }
    traces[0].scene.glplot.redraw(); 
}

function getConf() {
    var fname = binarypath + '/conf.json';
    var xhr = new XMLHttpRequest();
    xhr.open('GET', fname, true);
    xhr.responseType = 'json';
    xhr.onload = function(e) {
        conf = this.response;
        }
    xhr.send();
}

function getBinary() {
    var strIdx = '';
    for (i=0; i<(idxLength-guiVars.time.toString().length);i++){
        strIdx+='0';
    }
    strIdx+=guiVars.time.toString();
    var fname = binarypath + '/image-' + strIdx +'.bin';
    var xhr = new XMLHttpRequest();
    xhr.open('GET', fname, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function(e) {
        if (conf.dtype=='int16') {
            var scalars = new Int16Array(this.response);
            scalars = new Float32Array(scalars);
        } else {
            var scalars = new Float32Array(this.response); 
        }
        var count = 0;
        for (i=0; i<traces[0].data.surfacecolor.length; i++) {
            for (j=0; j<traces[0].data.surfacecolor[0].length; j++) {
                for (k=0; k<traces.length; k++) {
                    traces[k].data.surfacecolor[i][j] = scalars[count];
                    count++;
                }
            }
        }
        updateIntensity();
    };
    xhr.send();
}

function getArray() {
    for (i=0;i<traces.length;i++) {
        traces[i].data.surfacecolor = dataArray[guiVars.time][i]
    }
    updateIntensity(); 
}

function updateIntensity() {
    for (var m=0;m<traces.length;m++){
        intensity = getIntensity(traces[m]);
        var count = 6;
        for (i = 0; i < shape[0] - 1; ++i) {
            for (j = 0; j < shape[1] - 1; ++j) {
                for (k = 0; k < 6; ++k) {
                    r = i + QUAD[k][0]
                    c = j + QUAD[k][1]
                    tverts[m][count] = (intensity.get(r,c) - guiVars.loThresh) / (guiVars.hiThresh - guiVars.loThresh);
                    count=count+10;
                }
            }
        }  
        traces[m].surface._coordinateBuffer.update(tverts[m].subarray(0, tptr));
    }
    traces[0].scene.glplot.redraw();
    busy = false;
    if (delayUpdate==true) {
        delayUpdate=false;
        selectData;
    }   
}

function selectData() {
    if (busy==true) {
        delayUpdate=true;
        return
    } 
    busy = true;
    if (dataArray) {
        getArray();
    } else if (binarypath) {
        getBinary();
    }
}

module.exports = createSurface4d;