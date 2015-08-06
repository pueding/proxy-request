'use strict';
var debug = require( 'debug' )( 'proxy-request' );
var _ = require( 'lodash' );
var fs = require( 'fs' );
var q = require( 'q' );
var Xray = require('x-ray');
var request = require( 'request' );
var x = Xray();

var DEFAULT_TEST_URL = 'http://www.google.com/robots.txt';
var TEST_REQUEST_TIMEOUT = 5000;
var ERROR_MESSAGE = {
	NOT_AVAILABLE : 'There is no available proxy server',
	PROXY_IS_NOT_AVAILBABLE : 'This proxy is not available'
};
var USER_AGENT = {
	chrome : {
		version : '41.0.2228.0',
		useragent : 'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2228.0 Safari/537.36'
	},
	safari : {
		version : '7.0.3',
		useragent : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_3) AppleWebKit/537.75.14 (KHTML, like Gecko) Version/7.0.3 Safari/7046A194A'
	}
};

/**
 * @function ProxyRequest
 * @description Get request object with proxy
 * @param {object} [proxy_options]
 * @param {object} [request_options]
 * @return {Promise}
 */
var ProxyRequest = function( proxy_options, request_options ){
	// Init variables
	if( !proxy_options ){
		proxy_options = {};
	}
	if( !proxy_options.test_url ){
		proxy_options.test_url = DEFAULT_TEST_URL;
	}
	// set request_options
	if( !request_options ){
		request_options = {};
	}
	if( hasHttpsOption( proxy_options ) ){
		request_options.strictSSL = true;
	}
	if( hasUserAgentOption( proxy_options ) ){
		var useragent = USER_AGENT[ proxy_options.browser.toLowerCase() ].useragent;
		request_options.headers = { 'User-Agent': useragent };	
		debug( 'Set user agent : %s', request_options.headers[ 'User-Agent'] );
	}
	request_options.followRedirect = true;
	request_options.maxRedirects = 10;

	return getProxyList( proxy_options.proxy_source )
		.then( function( list ){
			if( !list || !list.length ){
				var error = new Error( ERROR_MESSAGE.NOT_AVAILABLE );
				throw error;
			}

			if( hasHttpsOption( proxy_options ) ){
				list = _.filter( list, function( proxy_server ){
					if( !proxy_server.https ){
						return false;
					}
					return true;
				});
				debug( 'Filter https' );
			}

			// SELECT PROXY IP
			return findAvailableProxy({
				list : list,
				request_options : request_options,
				proxy_options : proxy_options
			});
		});
};

// var getProxyOptionsString = function( proxy_options ){
// 	var result = 'cache';
// 	if( hasHttpsOption( proxy_options ) ){
// 		result = result + '|https:on';
// 	}else{
// 		result = result + '|https:off';
// 	}

// 	if( hasUserAgentOption( proxy_options ) ){
// 		result = result + '|useragent:' + proxy_options.browser.toLowerCase();
// 	}
// 	return result;
// };
var hasHttpsOption = function( proxy_options ){
	return ( proxy_options && _.isBoolean( proxy_options.https ) && proxy_options.https === true );
};
var hasUserAgentOption = function( proxy_options ){
	return ( proxy_options && _.isString( proxy_options.browser ) && USER_AGENT[ proxy_options.browser.toLowerCase() ] );
};
var findAvailableProxy = function( params ){
	// Init variables
	// Init params.index
	if( !_.isNumber( params.index ) ){
		params.index = 0;
	}
	// Init params.deferred
	if( !params.deferred ){
		params.deferred = q.defer();
	}

	// condition this recursive loop
	if( !params.list || !params.list.length ){
		params.deferred.reject( new Error( ERROR_MESSAGE.NOT_AVAILABLE ) );
		return params.deferred.promise;
	}

	var selected_proxy = params.list[ _.random( 0, params.list.length - 1 ) ];
	testProxy( selected_proxy.ip, selected_proxy.port, params.proxy_options.test_url )
	.then( function( result ){
		debug( 'Found : %s', result.ip + ':' + result.port );
		params.deferred.resolve( makeProxyRequest( result.ip, result.port, params.request_options ) );
	})
	.catch( function( error ){
		debug( error.message );
		params.index++;
		findAvailableProxy( params );
	});
	return params.deferred.promise;
};

var testProxy = function( ip, port, test_url ){
	var deferred = q.defer();
	// validation
	if( _.isEmpty( ip ) || _.isEmpty( port ) || _.isEmpty( test_url ) ){
		deferred.reject( new Error( 'not valid parameters' ) );
		return deferred.promise;
	}
	// make test request options
	var request_options = {};
	var useragent = USER_AGENT[ 'chrome' ].useragent;
	request_options.headers = { 'User-Agent': useragent };		
	request_options.timeout = TEST_REQUEST_TIMEOUT;
	request_options.proxy = 'http://' + ip + ':' + port;
	debug( 'Try to test %s', request_options.proxy );
	var proxyrequest_test = request.defaults( request_options );
	proxyrequest_test.get( test_url, function( error, response ){
		if( error || 
			!response || 
			response.statusCode !== 200 ){
			deferred.reject( error || new Error( ERROR_MESSAGE.PROXY_IS_NOT_AVAILBABLE ));
			return;
		}
		deferred.resolve({
			ip : ip,
			port : port
		});
	});

	return deferred.promise;
};
var makeProxyRequest = function( ip, port, request_options ){
	// Make pure request with request_options
	if( !request_options ){
		request_options = {};
	}
	request_options.proxy = 'http://' + ip + ':' + port;
	debug( 'Select %s', request_options.proxy );
	return request.defaults( request_options );
};

var proxy_list_cache = {};
var getProxyList = function( proxy_source_name ){
	// Init params
	if( !proxy_source_name || !proxy_sources[ proxy_source_name ] ){
		proxy_source_name = Object.keys( proxy_sources )[ 0 ];
	}
	// Load cache proxy
	var cache = proxy_list_cache[ proxy_source_name ];
	if( cache &&
		cache.list &&
		new Date( cache.tested_at + 60 * 1000 ) > new Date() ){
		debug( 'cached data : %s', proxy_source_name )
		return q( cache.list );
	}

	var func = proxy_sources[ proxy_source_name ];
	return func()
		.then( function( list ){
			debug( JSON.stringify( list, null, 2 ) );
			proxy_list_cache[ proxy_source_name ] = {
				tested_at : (new Date()).getTime(),
				list : list
			};
			return list;
		});
};

var usproxyorg = function(){
	var deferred = q.defer();
	x( 'http://www.us-proxy.org', 'table#proxylisttable tr', [{
	  	ip: 'td:nth-child(1)',
	  	port: 'td:nth-child(2)',
	  	code: 'td:nth-child(3)',
	  	country: 'td:nth-child(4)',
	  	anonymity: 'td:nth-child(5)',
	  	google: 'td:nth-child(6)',
	  	https: 'td:nth-child(7)',
	  	last_checked: 'td:nth-child(8)',
	}])( function( error, list ){
		if( error ){
			deferred.reject( error );
			return;
		}
		_.forEach( list, function( proxy ){
			if( !proxy.https ){
				return;
			}
			if( proxy.https === 'yes' ){
				proxy.https = true;
			}else{
				proxy.https = false;
			}
		});
		deferred.resolve( list );
	});
	return deferred.promise;
};
var freeproxylist = function(){
	var deferred = q.defer();
	x( 'http://free-proxy-list.net', 'table#proxylisttable tr', [{
	  	ip: 'td:nth-child(1)',
	  	port: 'td:nth-child(2)',
	  	code: 'td:nth-child(3)',
	  	country: 'td:nth-child(4)',
	  	anonymity: 'td:nth-child(5)',
	  	google: 'td:nth-child(6)',
	  	https: 'td:nth-child(7)',
	  	last_checked: 'td:nth-child(8)',
	}])( function( error, list ){
		if( error ){
			deferred.reject( error );
			return;
		}
		_.forEach( list, function( proxy ){
			if( !proxy.https ){
				return;
			}
			if( proxy.https === 'yes' ){
				proxy.https = true;
			}else{
				proxy.https = false;
			}
		});
		deferred.resolve( list );
	});
	return deferred.promise;
};
var ultraproxy = function(){
	var deferred = q.defer();
	x( 'http://www.ip-adress.com/proxy_list', 'table.proxylist tr', [{
	  	ip_port: 'td:nth-child(1)',
	}])( function( error, list ){
		if( error ){
			deferred.reject( error );
			return;
		}
		_.forEach( list, function( proxy ){
			if( !proxy.ip_port || !proxy.ip_port.trim() ){
				return;
			}
			var splitted = proxy.ip_port.split( ':' );
			proxy.ip = splitted[ 0 ];
			proxy.port = splitted[ 1 ];
		});
		list = _.filter( list, function( proxy ){
			return proxy.ip && proxy.ip.trim() && proxy.port && proxy.port.trim();
		});
		deferred.resolve( list );
	});
	return deferred.promise;
};
var manuelproxy = function(){
	var deferred = q.defer();
	fs.readFile( './data/proxy1.json',{ encoding : 'utf8' } ,function( error, data ){
		if( error ){
			deferred.reject( error );
			return;
		}
		deferred.resolve( JSON.parse( data ) );
		return;
	});
	return deferred.promise;	
};

var proxy_sources = {
	ultraproxy : ultraproxy,
	usproxyorg : usproxyorg,
	freeproxylist : freeproxylist,
	manuelproxy : manuelproxy,
	
};
module.exports = ProxyRequest;