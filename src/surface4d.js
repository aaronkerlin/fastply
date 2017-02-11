
var Plotly = require('../lib/plotly-latest.min.js')
var jpickle = require('jpickle')
var getUpsampled = require('../lib/getUpsampled')
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

//constant for inensity calculations
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
    coordsUp,
    tcount,
    traceF,
    maskDict,
    intensityBounds,
    intensityThresh,
    lastTime,
    fine_range,
    scatters,
    idxLength,
    fixedSurfaces = new Array,
    tverts,
    tptr,
    maskObjs,
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
  //create div for 3d graph
    graphDiv = document.createElement('div');
    graphId =  uuid.v4();
    graphDiv.id = graphId;
    graphDiv.style.width = 70 +'%';
  //create div for 2d graphs
    graphDiv2 = document.createElement('div');
    graphId2 =  uuid.v4();
    graphDiv2.id = graphId2;
    graphDiv2.style.width = 100 +'%';

    //adjust how divs are added depending on if we are in jupyter notebook or standalone webpage
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

    //starting to play with Mongo
    //var MongoClient = jsmongo.MongoClient
    // var url = 'mongodb://spinevis.int.janelia.org:27017'
    // MongoClient.connect(url, function(err, db) {
    //     assert.equal(null, err)
    //     console.log("Connected correctly to server.")
    //     db.close()
    // });


    var filePath = pathin; //path to pickle file
    jquery.get(filePath,function(fileData){

        //load the data
        var dict = jpickle.loads(fileData); //load pickle file dictionary
        try {
            var test = ('fig3d' in dict); //check that fig3d exists
        } catch (err) {
            throw "improper dictionary format";
            return
        }

        //copy the three main dictionaries
        fig3d  = dict.fig3d;
        figs2d = dict.figs2d;
        misc = dict.misc

        ntps = misc.volumeIndex.length //total number of timepoints
        if ('list' in fig3d) {
            dataArray = fig3d.list; //obsolete
        } else if ('binarypath' in fig3d) {
            binarypath = fig3d.binarypath; //path to binary intensity data
            idxLength = ntps.toString().length;
            getConf();
        } else {
            throw "improper extendedData format";
            return
        }

        if ('maskDict' in misc) {
            maskDict = misc.maskDict //mask 3d polygon information
        }
        if ('fixedSurfaces' in fig3d) {
            fixedSurfaces = fig3d.fixedSurfaces //list of surfaces that do not change intensity with time
        }
        if ('intensityBounds' in fig3d) {
            intensityBounds = fig3d.intensityBounds //min and max possible intensity values
        }
        if ('intensityThresh' in fig3d) {
            intensityThresh = fig3d.intensityThresh //default LUT thresholds
        } else {
            intensityThresh = [0.0, 1.0]
        }
        if ('surfaceSets' in fig3d) {
            surfaceSets = fig3d.surfaceSets // Sets of 3d objects to be manipulated independently
            if (maskDict) {
                surfaceSets.names.push("Masks") //add all masks as a set
            }
            surfaceSets.names.push("All") //Allows you to change properties of all sets at once
            surfaceSets.indicies.push([])

        } else {
            surfaceSets.names = ["All"]
            surfaceSets.indicies = [[]]
        }

        //convert 2D plot data into nested arrays
        plotnames = new Array(figs2d.length) //name of each plot
        plotshow = new Array(figs2d.length) //boolean which plots showing
        tracenames = new Array(figs2d.length) //name of each trace
        tracedata = new Array(figs2d.length) //y-data for each trace
        traceshow = new Array(figs2d.length) //boolean which traces to show
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

        //add mask 3d meshes
        if (maskDict) {
            addMasks()
        }
        //Plot initial 3d figure
        Plotly.newPlot(graphDiv, data=fig3d.initialFig.data, layout=fig3d.initialFig.layout, {showLink: false});




        //Collect surface trace objects and tvert data
        traces = new Array(fig3d.initialFig.data.length); //copy of surface objects
        var coords = new Array(fig3d.initialFig.data.length); //original coordinate data
        var coordsUp = new Array(fig3d.initialFig.data.length); //upsampled coordinate data
        tverts = new Array(fig3d.initialFig.data.length); //3d data in webGL ready format
        var params;
        var trace;
        var nMasks = 0
        var nSurfs = 0
        maskObjs = []
        for (var traceName in graphDiv._fullLayout.scene._scene.traces){//grabbing 3d objects from the current scene
            trace = graphDiv._fullLayout.scene._scene.traces[traceName];
            if ('surface' in trace) { //check that object is a surface
                params = getParams(trace); //prepare objects for conversion
                coords[trace.data.index] = params.coords;
                var cu = new Array(3)
                cu[0] = getUpsampled(trace, trace.data.x) //upsample x for display
                cu[1] = getUpsampled(trace, trace.data.y) //upsample y for display
                cu[2] = getUpsampled(trace, trace.data.z) //upsample z for display
                coordsUp[trace.data.index] = cu
                intensity = getUpsampled(trace, trace.data.surfacecolor); //upsample intensity for display
                params = {coords: params.coords, intensity: intensity};
                tverts[trace.data.index] = getTverts(trace.surface, params); //convert to webGL ready format
                traces[trace.data.index] = trace;
                trace.surface.opacity = Math.min(trace.surface.opacity,0.99); //force opacity to 0.99 or lower
                nSurfs++
            } else if ('mesh' in trace) {//check that object is a mesh
                nMasks++
                maskObjs.push(trace)
            }

        }

        //Plot initial 2d figure
        plot2d()
        var layers = graphDiv2._fullLayout._plots.xy.plot[0][0].children
        scatters = layers[layers.length-1]
        colorMasks()


       //not sure why this is necessary given traces shouldn't have meshes
        traces=traces.slice(nMasks,traces.length)
        coords=coords.slice(nMasks,coords.length)
        coordsUp=coordsUp.slice(nMasks,coordsUp.length)
        tverts=tverts.slice(nMasks,tverts.length)

        shape = traces[0].surface.shape.slice();
        tptr = (shape[0] - 1) * (shape[1] - 1) * 6 * 10;

        //trying to prevent orphan objects from building up in browser memory
        graphDiv.onremove = function () {
            traces[0].scene.destroy();
            gui.length=0;
            pool.freeFloat(tverts);
            tverts.length=0;
            window.fastply.length=0;
        }


        //take GUI defaults from first surface
        guiVars = {time: Math.round(ntps/2),
            loThresh: intensityThresh[0],
            hiThresh:  intensityThresh[1],
            opacity: 0.8,
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


        //Generate dat.GUI object and specify its placement in the div
        gui = new dat.GUI({ autoPlace: false })
        gui.domElement.style.float = 'left'
        outputCell.firstChild.style['margin-left'] = gui.domElement.style.width
        outputCell.insertBefore(gui.domElement, outputCell.firstChild);

        //Populate the 3D controls
        var displayF = gui.addFolder('3D Plot')
        displayF.add(guiVars, 'surfaces',fig3d.surfaceSets.names)
        displayF.add(guiVars, 'show_surf')//.onChange(toggleVis)
        displayF.add(guiVars, 'loThresh').min(intensityBounds[0]).max(intensityBounds[1]).onChange(selectData);
        displayF.add(guiVars, 'hiThresh').min(intensityBounds[0]).max(intensityBounds[1]).onChange(selectData);
        displayF.add(guiVars, 'opacity').min(0).max(0.99).onChange(changeOpacity);

        //Populate the 2D controls
        traceF = gui.addFolder('2D Plot')
        traceF.add(guiVars, 'plotSet', plotnames).onChange(plotChange)
        traceF.add(guiVars, 'show_plot').listen().onChange(plotShow)
        traceF.add(guiVars, 'traces', tracenames[guiVars.plotIdx]).onChange(traceChange)
        traceF.add(guiVars, 'show_trace').listen().onChange(traceShow)

        var maskF = gui.addFolder('Mask Selection')
        maskF.add(guiVars, 'show_mask')

        jquery(gui.domElement.getElementsByTagName('option')).css('color','#000000')
        jquery(gui.domElement.getElementsByTagName('select')).css('color','#000000')

        //Set all folders open
        displayF.open();
        traceF.open();
        maskF.open();

        //get initial limits of the x-axis
        axisLims[0] = graphDiv2._fullLayout.xaxis.range[0]
        axisLims[1] = graphDiv2._fullLayout.xaxis.range[1]

        //Initial recalculations based on default settings
        changeColormap();//reset colormap with alpha control
        selectData();//grab intensity data for middle timepoint
        changeOpacity();//update opacity to GUI default

        //On click callback, save click position in clickLoc. May not currently be in use.
        graphDiv.on('plotly_click', function(ev){
            var ptNum = ev.points[0].pointNumber
            var clickLoc = Array(3)
            if (ptNum.length ==2){
                var curveNum = ev.points[0].curveNumber - nMasks
                for (i=0; i<3; i++) {
                    clickLoc[i] = Math.round(coordsUp[curveNum][i].get(ptNum[0],ptNum[1]))
                }
            } else {
                clickLoc[0] = ev.points[0].data.x[ptNum]
                clickLoc[1] = ev.points[0].data.y[ptNum]
                clickLoc[2] = ev.points[0].data.z[ptNum]
            }
            console.log(clickLoc)
        })

        //relayout callback will occur whenever user zooms, finishes dragging,
        //resets, adds or removes traces from a 2D plot. When this occurs we identify the new start and end
        //of teh x-axis and limit the data activly drawn by plotly to that range
        graphDiv2.on('plotly_relayout', function(ev){
            if ('xaxis.range' in ev) {
                console.log(ev)
                var dur = ev['xaxis.range'][1] - ev['xaxis.range'][0]
                var xSt = ev['xaxis.range'][0] - dur
                var xEnd = ev['xaxis.range'][1] + dur
                if (xEnd>tracedata[0][0].length) {
                    xEnd=tracedata[0][0].length
                }
                if (xSt<0) {
                    xSt=0
                }
                for (i=0; i<tracedata[0].length; i++) {
                    if ('x' in tracedata[0][i]) {
                        var x = tracedata[0][i].x
                    } else {
                        var x = misc.volumeIndex
                    }
                    subSt = x.findIndex(function(element,index,array) {return element>=xSt})
                    subEnd = x.findIndex(function(element,index,array) {return element>=xEnd})
                    graphDiv2.data[i].x=x.slice(subSt,subEnd)
                    graphDiv2.data[i].y=tracedata[0][i].y.slice(subSt,subEnd)

                }
                Plotly.redraw(graphDiv2)
            }

        })

        //detect that replotting event occured and is complete, then call timeShift
        watch(graphDiv2, ['_replotting'], function(){
            if (graphDiv2._replotting==false) {
                timeShift()
            }
        })

        //detect that user is dragging the plot, call timeShift every 33 milliseconds
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

//function clickResponse(e){
//    console.log('hi')
//    console.log(e)
//}
// function toggleVis(){
//     console.log(traces[0])
//     if (guiVars.surfaces == 'Masks') {
//         var idx = []
//         for (i=0; i<maskObjs.length; i++){
//             idx.push(i)
//         }
//         Plotly.restyle(graphDiv,{'visible':guiVars.show_surf},idx)
//     } else {
//         for (i=0;i<traces.length;i++){
//             traces[i].surface.visible = guiVars.show_surf;
//             traces[i].surface.dirty = true
//         }
//     }
// }

//For each maskm, add a 3D mesh to the fig3d data
function addMasks(){
    var Polys = maskDict.Polys
    var Pts = maskDict.Pts
    for (i=Polys.length-1; i>-1; i--) {
        trace = {x: Pts[i][0], y: Pts[i][1], z: Pts[i][2], i: Polys[i][0], j: Polys[i][1], k: Polys[i][2], color: 'gray', showscale: false,
        name: 'mask '+ i.toString(), opacity: 0.1, type: 'mesh3d','hoverinfo': 'name'}
        fig3d.initialFig.data.unshift(trace)
    }
}

//Based on the "show" arrays (i.e., plotshow and traceshow) construct plotly format
//data objects (i.e., traces).
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
                    var trace = jquery.extend({},tracedata[i][j])
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
    if (!initialized) { //if first time run new plot
        Plotly.newPlot(graphDiv2, data, layout, {showLink: false})
        initialized = true
    } else { //otherwise redraw is faster
        graphDiv2.data = data
        graphDiv2.layout = layout
        Plotly.redraw(graphDiv2)
    }

}

//Color mask 3d meshes so that they match the color of the corresponding 2D trace
function colorMasks(){
    for (var i=0; i<tracenames[0].length; i++) {//for each trace data
        var maskIdx = tracenames[0][i].indexOf('mask')
        if (maskIdx>=0) {
            var meshId = parseInt(tracenames[0][i].substring(maskIdx+4,tracenames[0][i].length))//corresponsing maskID
            //set color of mesh to style of equivalent line HTML object
            Plotly.restyle(graphDiv, {opacity: 0.8, color: scatters.children[i].children[0].style.stroke}, meshId)
        }
    }
}

//User selected to add new trace to a plot, check GUI for current trace and add it
function addTrace(){
    var pi = axisId[guiVars.plotIdx]
    var trace = tracedata[guiVars.plotIdx][guiVars.tracesIdx]
    trace.yaxis = 'y' + pi.toString()
    Plotly.addTraces(graphDiv2, trace)
    traceId[guiVars.plotIdx][guiVars.tracesIdx] = tcount++
}

//User selected to delete a trace from a plot, check GUI for current trace and add it
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

//User selected a different parent plot in the GUI, update the GUI traces and
//show variables to reflect the current parent plot
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

//User changed the visibility of a plot. Change plotshow variable and call plot2d to replot everything
function plotShow(){
    if (guiVars.plotIdx==0) {
        guiVars.show_plot = 1
        return
    }
    plotshow[guiVars.plotIdx] = guiVars.show_plot
    plot2d()
}

//User selected a different trace in the GUI, update checkbox to reflect if that trace is currently visible
function traceChange() {
    guiVars.tracesIdx = tracenames[guiVars.plotIdx].indexOf(guiVars.traces)
    guiVars.show_trace = traceshow[guiVars.plotIdx][guiVars.tracesIdx]
}

//User clicked trace show checkbox. Add or delete trace accordingly.
function traceShow(){
    traceshow[guiVars.plotIdx][guiVars.tracesIdx] = guiVars.show_trace
    if (guiVars.show_trace) {
        addTrace()
    } else {
        deleteTrace()
    }
}


//for each 3d surface, get its tinycolor-compatible colorscale string.
//Then change the colormap of each rendered surface object to reflect a alpha-thresholded
// rgba equivalent colormap
function changeColormap() {
    for (i=0;i<traces.length;i++){
        var cs = traces[i].data.colorscale
        traces[i].surface._colorMap.setPixels(genColormap(parseColorScale(cs)));
    }
    traces[0].scene.glplot.redraw();
}

//return rgba colormap from tinycolor-compatible colorscale string
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

//return alpha-threhsolded webGL-compatible colormap from rgba colormap
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

//x-axis may have moved. If axisLims have changed, call selectData to update 3d intensity
function timeShift(){
    guiVars.time = Math.round((graphDiv2._fullLayout.xaxis.range[0] + graphDiv2._fullLayout.xaxis.range[1])/2)
    guiVars.time=Math.max(guiVars.time, axisLims[0])
    guiVars.time=Math.min(guiVars.time, axisLims[1])
    if (guiVars.time!=lastTime) {
        lastTime = guiVars.time
        selectData()
    }
}

//User changed some opacity setting. Depedning on surface set, update the opacity of all objects within set.
//Call changeColormap to update rgba lookup
function changeOpacity() {
    if (guiVars.surfaces == 'Masks') {
        for (i=0; i<maskObjs.length; i++){
            maskObjs[i].mesh.opacity = guiVars.opacity;
        }
    } else {
        for (i=0;i<traces.length;i++){
            traces[i].surface.opacity = guiVars.opacity;
        }
    }
    changeColormap();
    //traces[0].scene.glplot.redraw();
}

//Get dimensions of the binary data from the conf.json file in the binary folder
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

//Get binary file data, save it to traces object and call updateIntensity
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
        //if conf.json indicates that data is int16, convert to Float32 after retrieval
        if (conf.dtype=='int16') {
            var scalars = new Int16Array(this.response);
            scalars = new Float32Array(scalars);
        } else {
            var scalars = new Float32Array(this.response);
        }
        //replace surfacecolor (i.e., intensity) data in traces objects
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

//obsolete, used if data not stored in binary
function getArray() {
    for (i=0;i<traces.length;i++) {
        traces[i].data.surfacecolor = dataArray[guiVars.time][i]
    }
    updateIntensity();
}

//new intensity data has been placed in surfacecolor. Process it and update GL objects directly for efficiency.
function updateIntensity() {
    for (var m=0;m<traces.length;m++){
        //upsample the intensity to fit the upsampled x,y,z coordinates
        intensity = getUpsampled(traces[m], traces[m].data.surfacecolor);
        //change the intensity values in tverts (webGL-compatible representation of the entire surface object)
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
        //send tverts into the object webGL buffer
        traces[m].surface._coordinateBuffer.update(tverts[m].subarray(0, tptr));
    }
    //force a gl-level redraw
    traces[0].scene.glplot.redraw();
    busy = false;
    //if we've been ignoring other selectData calls, call selectData again to get up-to-date
    if (delayUpdate==true) {
        delayUpdate=false;
        selectData;
    }
}

//respond to new intensity data request
function selectData() {
    //if still busy with previous request, hold off
    if (busy==true) {
        delayUpdate=true;
        return
    }
    busy = true;
    if (dataArray) {
      //if intensity data in browser memory
        getArray();
    } else if (binarypath) {
      //if intensity data in remote binary files
        getBinary();
    }
}

module.exports = createSurface4d;
