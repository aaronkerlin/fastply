from IPython.display import display, Javascript
import cPickle

class fastply(object):
	"""Modified plotly for fast interactive viewing of large data in Jupyter notebook or standalone webpage
	"""

	def __init__(self, remoteroot='/tier2/svoboda', localhost='localhost:8000', lib='users/Aaron/lib'):
		"""Initialize new surface4d object
		:param: remoteroot: path to equivalent root directory served by localhost
		:param: localhost: localhost address
		:param: lib: directory containing fastply.min.js
		"""
		self.remoteroot = remoteroot;
		self.localhost = localhost;
		self.lib = lib;


	def save(self, filename, data):
		"""	Save formatted plot data to disk
		:param: filename: path to save pickle and html file	
		:param: fig: plotly-formatted dict defining initial plot
		:param: extendedData: additional data (i.e., more time points)

		plot type specifications:
			surface4d:
				fig: must contain at least one surface
				extendedData: dictionary of: 
					list: 4D surface data as nested lists [time][surface][x][y] (cannot exceed 5MB total),
						if set then binarypath ignored 
					binarypath: path to folder binary file per time point (cannot exceed 5MB/time point)

		"""
		fname = filename[(len(self.remoteroot)+1):]
		html_str = ['<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + filename +
				'</title></head><body></body><script src=/' + self.lib +
				'/fastply.min.js></script><script type="text/Javascript">fastply.surface4d("' +
				'http://' + self.localhost + '/' + fname + '.p");  </script></html>']

		Html_file= open(filename+'.html',"w")
		Html_file.write(html_str[0])
		Html_file.close()

		cPickle.dump(data,
             open(filename+'.p', "wb" ))




	def display(self, filename, plottype):
		"""Display fastply pickle file in notebook  
		:param: filename: pickle file to load
		:param: plottype: type of fastply plot (currently only 'surface4d')  
		"""
		fname = filename[(len(self.remoteroot)+1):]
		javascript = 'fastply.'+ plottype +'("'+'http://'+self.localhost+'/'+fname+'",element);'
		lib = 'http://'+self.localhost+'/'+self.lib +'/fastply.min.js';
		display(Javascript(javascript, lib = lib));