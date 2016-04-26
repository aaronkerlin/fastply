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
    time,
    graphDiv,
    dataArray,
    outputCell,
    binarypath,
    scalars,
    traces,
    ntps,
    idxLength,
    tverts,
    tptr,
    shape,
    conf,
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


    if (!element) {
        //append to document
        document.body.appendChild(graphDiv);
        outputCell = graphDiv;
    } else {
        //In notebook
        notebookMode = true
        //append to output cell
        element.append(graphDiv);
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
            var test = (('fig' in dict) && ('extendedData' in dict));
        } catch (err) {
            throw "improper dictionary format";
            return
        }

        var fig  = dict.fig;

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

        //Plot initial data 
        Plotly.newPlot(graphDiv, data=fig.data, layout=fig.layout, {showLink: false});

        //Collect trace objects and tvert data
        traces = new Array(fig.data.length);
        var coords = new Array(fig.data.length);
        tverts = new Array(fig.data.length);
        var params;
        var trace;
        for (var traceName in graphDiv._fullLayout.scene._scene.traces){
            trace = graphDiv._fullLayout.scene._scene.traces[traceName];
            if ('data' in trace) { 
                params = getParams(trace);
                coords[trace.data.index] = params.coords;
                intensity = getIntensity(trace);
                params = {coords: coords, intensity: intensity};
                tverts[trace.data.index] = getTverts(trace.surface, params);
                traces[trace.data.index] = trace;
                trace.surface.opacity = Math.min(trace.surface.opacity,0.99);
            }
        }
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
        guiVars = {time_course: Math.round(ntps/2),
            time_fine: 0, 
            time: Math.round(ntps/2),
            loThresh: trace.surface.intensityBounds[0],
            hiThresh:  trace.surface.intensityBounds[1],
            opacity: trace.surface.opacity,
            colormap: 'greys'}

        //Setup GUI
        var gui = new dat.GUI({ autoPlace: false })
        outputCell.insertBefore(gui.domElement, outputCell.firstChild);
        
        var displayF = gui.addFolder('Display');
        displayF.add(guiVars, 'loThresh').min(-100).max(guiVars.hiThresh).onChange(selectData);
        displayF.add(guiVars, 'hiThresh').min(-100).max(guiVars.hiThresh).onChange(selectData);
        displayF.add(guiVars, 'colormap', colormaps).onChange(changeColormap);
               //.style.color = '#555'
        displayF.add(guiVars, 'opacity').min(0).max(0.99).onChange(changeOpacity);
        var dataF = gui.addFolder('Time');
        dataF.add(guiVars, 'time_course').min(0).max(ntps-1).step(1).onChange(selectData);
        var tfrange = Math.min(Math.round(ntps/2),50)
        dataF.add(guiVars, 'time_fine').min(-tfrange).max(tfrange).step(1).onChange(selectData);
        jquery(gui.domElement.getElementsByTagName('option')).css('color','#000000')
        jquery(gui.domElement.getElementsByTagName('select')).css('color','#000000')


        displayF.open();
        dataF.open();

        //Initial recalc based on default settings
        changeColormap();
        selectData();
        changeOpacity();
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
    guiVars.time = guiVars.time_course + guiVars.time_fine;
    guiVars.time = Math.max(guiVars.time,0)
    guiVars.time = Math.min(guiVars.time, ntps-1)
    if (dataArray) {
        getArray();
    } else if (binarypath) {
        getBinary();
    }
}

module.exports = createSurface4d;