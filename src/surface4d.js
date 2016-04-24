var Plotly = require('../lib/plotly-latest.min.js')
var jpickle = require('jpickle')
var getIntensity = require('../lib/getIntensity')
var getParams = require('../lib/getParams')
var getTverts = require('../lib/getTverts')
var jquery = require('jquery')
var dat = require('dat-gui')


var QUAD = [
  [0, 0],
  [0, 1],
  [1, 0],
  [1, 1],
  [1, 0],
  [0, 1]
]

var traceIdx,
    intensity,
    count,
    i,
    j,
    k,
    r,
    c,
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
    guiVars,
    notebookMode = false;

var createSurface4d = function (pathin, element) {
    graphDiv = document.createElement('div');
    graphDiv.id = "plot";
    graphDiv.style.width = 80 +'%';

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
                }
        }
        shape = trace.surface.shape.slice();
        tptr = (shape[0] - 1) * (shape[1] - 1) * 6 * 10;
        
        //take defaults from first surface
        guiVars = {time: Math.round(ntps/2), 
            loThresh: trace.surface.intensityBounds[0],
            hiThresh:  trace.surface.intensityBounds[1],
            opacity: trace.surface.opacity}

        //Setup GUI
        var gui = new dat.GUI({ autoPlace: false })
        outputCell.insertBefore(gui.domElement, outputCell.firstChild);
        
        var displayF = gui.addFolder('Display');
        displayF.add(guiVars, 'loThresh').min(0).max(guiVars.hiThresh).onChange(selectData);
        displayF.add(guiVars, 'hiThresh').min(0).max(guiVars.hiThresh).onChange(selectData);
        displayF.add(guiVars, 'opacity').min(0).max(1).onChange(changeOpacity);
        var dataF = gui.addFolder('Data');
        dataF.add(guiVars, 'time').min(0).max(ntps-1).step(1).onChange(selectData);
        displayF.open();
        dataF.open();

        //Initial recalc based on default settings
        selectData();
        changeOpacity();
    })
}

function changeOpacity() {
    for (i=0;i<traces.length;i++){
        traces[i].surface.opacity = guiVars.opacity;

    }
    traces[0].scene.glplot.redraw();    
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
        var scalars = new Float32Array(this.response); 
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
}

function selectData() {
    if (dataArray) {
        getArray();
    } else if (binarypath) {
        getBinary();
    }
}

module.exports = createSurface4d;