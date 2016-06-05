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
var tinycolor = require('tinycolor2');
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



//var colormaps = [
//        'jet', 'hsv','hot','cool','spring','summer','autumn','winter','bone',
//        'copper','greys','YIGnBu','greens','YIOrRd','bluered','RdBu','picnic',
//       'rainbow','portland','blackbody','earth','electric'
//    ];

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
    fig3d,
    figs2d,
    misc,
    plotnames,
    plotshow, 
    tracenames, 
    tracedata, 
    traceshow, 
    axisId,
    traceId,
    pcount,
    tcount,
    traceF,
    intensityBounds,
    lastTime,
    fine_range,
    rangeslider,
    idxLength,
    fixedSurfaces = new Array,
    tverts,
    tptr,
    gui,
    shape,
    conf,
    initialized = false,
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
        document.body.appendChild(graphDiv2);
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
            var test = ('fig3d' in dict);
        } catch (err) {
            throw "improper dictionary format";
            return
        }

        fig3d  = dict.fig3d;
        figs2d = dict.figs2d;
        misc = dict.misc
        
        ntps = misc.volumeIndex.length
        if ('list' in fig3d) {
            dataArray = fig3d.list;
        } else if ('binarypath' in fig3d) {
            binarypath = fig3d.binarypath;
            idxLength = ntps.toString().length;
            getConf();
        } else {
            throw "improper extendedData format";
            return
        }

        if ('fixedSurfaces' in fig3d) {
                fixedSurfaces = fig3d.fixedSurfaces
        } 
        if ('intensityBounds' in fig3d) {
                intensityBounds = fig3d.intensityBounds
                        console.log(intensityBounds)
        } 
        if ('surfaceSets' in fig3d) {
                surfaceSets = fig3d.surfaceSets
                console.log(surfaceSets.names)  
                console.log(surfaceSets.indicies)  
                surfaceSets.names.push("All")
                surfaceSets.indicies.push([])
        } else {
                surfaceSets.names = ["All"]
                surfaceSets.indicies = [[]]
        }


        plotnames = new Array(figs2d.length)
        plotshow = new Array(figs2d.length)
        tracenames = new Array(figs2d.length)
        tracedata = new Array(figs2d.length)
        traceshow = new Array(figs2d.length)
        for (i=0; i<figs2d.length; i++) {
            plotnames[i]=figs2d[i].name
            plotshow[i] = true
            var tn = new Array(figs2d[i].traces.length)
            var td = new Array(figs2d[i].traces.length)
            var ts = new Array(figs2d[i].traces.length)
            for (j=0; j<figs2d[i].traces.length; j++) {
                tn[j]=figs2d[i].traces[j].name
                td[j]=figs2d[i].traces[j]
                ts[j]=true
            }
            tracenames[i]=tn
            tracedata[i]=td
            traceshow[i]=ts       
        }
        
        //Plot initial 3d figure 
        Plotly.newPlot(graphDiv, data=fig3d.initialFig.data, layout=fig3d.initialFig.layout, {showLink: false});
        //Plot initial 2d figure
        plot2d()

        //console.log(graphDiv2._fullLayout)
        //Collect trace objects and tvert data
        traces = new Array(fig3d.initialFig.data.length);
        var coords = new Array(fig3d.initialFig.data.length);
        tverts = new Array(fig3d.initialFig.data.length);
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
            surfaces: fig3d.surfaceSets.names[fig3d.surfaceSets.names.length-1],
            surfSetIdx: fig3d.surfaceSets.names.length-1, 
            show_surf: true,
            plotSet: plotnames[0],
            plotIdx: 0,
            show_plot: plotshow[0],
            traces: tracenames[0][0],
            tracesIdx: 0,
            show_trace: traceshow[0][0],
            show_mask: 'not implemented'}


        //Setup GUI
        gui = new dat.GUI({ autoPlace: false })
        outputCell.insertBefore(gui.domElement, outputCell.firstChild);
        
        var displayF = gui.addFolder('3D Plot')
        displayF.add(guiVars, 'surfaces',fig3d.surfaceSets.names)
        displayF.add(guiVars, 'show_surf')
        displayF.add(guiVars, 'loThresh').min(intensityBounds[0]).max(intensityBounds[1]).onChange(selectData);
        displayF.add(guiVars, 'hiThresh').min(intensityBounds[0]).max(intensityBounds[1]).onChange(selectData);
        displayF.add(guiVars, 'opacity').min(0).max(0.99).onChange(changeOpacity);

        traceF = gui.addFolder('2D Plot')
        traceF.add(guiVars, 'plotSet', plotnames).onChange(plotChange)
        traceF.add(guiVars, 'show_plot').listen().onChange(plotShow)
        traceF.add(guiVars, 'traces', tracenames[guiVars.plotIdx]).onChange(traceChange)
        traceF.add(guiVars, 'show_trace').listen().onChange(traceShow)        

        var maskF = gui.addFolder('Mask Selection')
        maskF.add(guiVars, 'show_mask')

        jquery(gui.domElement.getElementsByTagName('option')).css('color','#000000')
        jquery(gui.domElement.getElementsByTagName('select')).css('color','#000000')

        
        displayF.open();
        traceF.open();
        maskF.open();

        axisLims[0] = graphDiv2._fullLayout.xaxis.range[0]
        axisLims[1] = graphDiv2._fullLayout.xaxis.range[1]

        //Initial recalc based on default settings
        changeColormap();
        selectData();
        changeOpacity();

        

        watch(graphDiv2, ['_replotting'], function(){
            if (graphDiv2._replotting==false) {
                timeShift()
            }
        })

        watch(graphDiv2, ['_dragging'], function(){
            if (graphDiv2._dragging==true) {
                var panshift
                var id = setInterval(xShift,33)
                function xShift() {
                    if (graphDiv2._dragging==false) {
                        clearInterval(id)
                    } else {
                        timeShift() 
                    }
                }
            }
        })

    })
}

function plot2d(){
    var data = []
    var layout = misc.baseLayout2D
    pcount = 0
    tcount = 0
    var pTotal = 0
    var domain = 0
    var yIdx = ''
    axisId = new Array(plotnames.length)
    traceId = new Array(plotnames.length)
    for (i = 0; i < plotnames.length; i++) {
        var ti = new Array(tracenames[i].length) 
        for (j = 0; j < tracenames[i].length; j++) {
            ti[j] = 0
        }
        traceId[i] = ti
        pTotal++
    }
    var domainInc = 1 / pTotal
    for (i = 0; i < plotnames.length; i++) {
        if (plotshow[i]) {
            pcount++
            axisId[i] = pcount
            for (j=0; j<tracenames[i].length; j++) {
                if (traceshow[i][j]) {
                    traceId[i][j] = tcount
                    tcount++
                    var trace = tracedata[i][j]
                    trace.yaxis = 'y' + pcount.toString()
                    if (!('x' in trace)) {
                        trace.x = misc.volumeIndex
                    }
                    data.push(trace) 
                }
            }
            if (pcount>1) {
                yIdx = pcount.toString() 
            }
            layout['yaxis'+ yIdx] = {domain: [domain, domain+domainInc]}
            domain = domain + domainInc
        }
    }
    if (!initialized) {
        Plotly.newPlot(graphDiv2, data, layout, {showLink: false})
        initialized = true
    } else {
        graphDiv2.data = data
        graphDiv2.layout = layout
        Plotly.redraw(graphDiv2)
    }
    
}

function addTrace(){
    var pi = axisId[guiVars.plotIdx]
    var trace = tracedata[guiVars.plotIdx][guiVars.tracesIdx]
    trace.yaxis = 'y' + pi.toString()
    Plotly.addTraces(graphDiv2, trace)
    traceId[guiVars.plotIdx][guiVars.tracesIdx] = tcount++
}

function deleteTrace(){
    var ti = traceId[guiVars.plotIdx][guiVars.tracesIdx]
    Plotly.deleteTraces(graphDiv2, ti)
        
    for (i = 0; i < plotnames.length; i++) {
        for (j=0; j<tracenames[i].length; j++) {
            if (traceId[i][j] > ti) {
                traceId[i][j]--
            }
        }    
    }    
    traceId[guiVars.plotIdx][guiVars.tracesIdx] = 0
    tcount--
}

function plotChange(){
    guiVars.plotIdx = plotnames.indexOf(guiVars.plotSet)
    guiVars.show_plot = plotshow[guiVars.plotIdx]
    traceF.__ul.removeChild(traceF.__ul.lastChild)
    traceF.__ul.removeChild(traceF.__ul.lastChild)

    guiVars.show_trace = traceshow[guiVars.plotIdx][0]
    guiVars.traces = tracenames[guiVars.plotIdx][0]
    traceF.add(guiVars, 'traces', tracenames[guiVars.plotIdx]).onChange(traceChange)
    traceF.add(guiVars, 'show_trace').listen().onChange(traceShow)  

    jquery(gui.domElement.getElementsByTagName('option')).css('color','#000000')
    jquery(gui.domElement.getElementsByTagName('select')).css('color','#000000')
      
}

function plotShow(){
    if (guiVars.plotIdx==0) {
        guiVars.show_plot = 1
        return
    }
    plotshow[guiVars.plotIdx] = guiVars.show_plot
    plot2d()
}

function traceChange() {
    guiVars.tracesIdx = tracenames[guiVars.plotIdx].indexOf(guiVars.traces)
    guiVars.show_trace = traceshow[guiVars.plotIdx][guiVars.tracesIdx]
}

function traceShow(){
    traceshow[guiVars.plotIdx][guiVars.tracesIdx] = guiVars.show_trace
    if (guiVars.show_trace) {
        addTrace()
    } else {
        deleteTrace()
    }
}


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


function genColormap (name) {
  var x = pack([colormap({
    colormap: name,
    nshades: N_COLORS,
    format: 'rgba',
    alpha: [0,1]
  }).map(function (c) {
    return [c[0], c[1], c[2], 255 * c[3]]
  })])
  ops.divseq(x, 255.0)
  x.set(0,0,3,0)
  return x
}

function changeColormap() {
    for (i=0;i<traces.length;i++){
        var cs = traces[i].data.colorscale
        traces[i].surface._colorMap.setPixels(genColormap(parseColorScale(cs)));
    }                    
    traces[0].scene.glplot.redraw(); 
}

function timeShift(){
    guiVars.time = Math.round((graphDiv2._fullLayout.xaxis.range[0] + graphDiv2._fullLayout.xaxis.range[1])/2)
    guiVars.time=Math.max(guiVars.time, axisLims[0])
    guiVars.time=Math.min(guiVars.time, axisLims[1])
    if (guiVars.time!=lastTime) {
        lastTime = guiVars.time
        selectData()
    }
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
                    if (jquery.inArray(k,fixedSurfaces)==-1) {
                            traces[k].data.surfacecolor[i][j] = scalars[count];
                            count++;
                        }
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