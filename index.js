'use strict';
var debug = require( 'debug' )( 'proxy-request' );
var _ = require( 'lodash' );
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
var cache = {};

/**
 * @function ProxyRequest
 * @description Get request object with proxy
 * @param {object} [proxy_options]
 * @param {object} [request_options]
 * @return {Promise}
 */
var ProxyRequest = function( proxy_options, request_options ){
	var deferred = q.defer();
	var promise;

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

	// Get cache proxy filtering by options - https, browser
	debug( 'Cache key : %s', getProxyOptionsString( proxy_options ) );
	var cached = cache[ getProxyOptionsString( proxy_options ) ];
	if( cached && 
		cached.ip &&
		cached.port &&
		cached.tested_at &&
		new Date( cached.tested_at + 60 * 1000 ) < new Date() ){
		promise = testProxy( cached.ip, cached.port, proxy_options.test_url )
			.then( function( result ){
				cached.tested_at = new Date();
				return makeProxyRequest( result.ip, result.port, request_options );
			})
			.then( function( request ){
				deferred.resolve( request );
			})
			.catch( function( error ){
				deferred.reject( error );
			});
	}else{
		promise = q.reject();
	}
	// If cache proxy is not available, get fresh one
	promise.catch( function(){
		getProxyList()
		.then( function( list ){
			debug( JSON.stringify( list, null, 2 ) );
			if( !list || !list.length ){
				var error = new Error( ERROR_MESSAGE.NOT_AVAILABLE );
				throw error;
			}

			if( hasHttpsOption( proxy_options ) ){
				list = _.filter( list, function( proxy_server ){
					if( !proxy_server.https ){
						return false;
					}
					if( proxy_server.https === 'yes' ){
						return true;
					}
				});
				debug( 'Filter https' );
			}

			// SELECT PROXY IP
			return findAvailableProxy({
				list : list,
				request_options : request_options,
				proxy_options : proxy_options
			});
		})
		.then( function( request ){
			deferred.resolve( request );
		})
		.catch( function( error ){
			debug ( error.message );
			deferred.reject( error );
		});
	});
	
	return deferred.promise;
};

var getProxyOptionsString = function( proxy_options ){
	var result = 'cache';
	if( hasHttpsOption( proxy_options ) ){
		result = result + '|https:on';
	}else{
		result = result + '|https:off';
	}

	if( hasUserAgentOption( proxy_options ) ){
		result = result + '|useragent:' + proxy_options.browser.toLowerCase();
	}
	return result;
};
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
	if( params.list.length <= params.index ){
		params.deferred.reject( new Error( ERROR_MESSAGE.NOT_AVAILABLE ) );
		return params.deferred.promise;
	}

	var selected_proxy = params.list[ params.index ];
	testProxy( selected_proxy.ip, selected_proxy.port, params.proxy_options.test_url )
	.then( function( result ){
		debug( 'Found : %s', result.ip + ':' + result.port );
		cache[ getProxyOptionsString( params.proxy_options ) ] = {
			ip : result.ip,
			port : result.port,
			tested_at : new Date()
		};
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
var getProxyList = function(){
	return ultraproxy();
};

var uxproxyorg = function(){
	x( 'http://www.us-proxy.org', 'table#proxylisttable tr', [{
	  	ip: 'td:nth-child(1)',
	  	port: 'td:nth-child(2)',
	  	code: 'td:nth-child(3)',
	  	country: 'td:nth-child(4)',
	  	anonymity: 'td:nth-child(5)',
	  	google: 'td:nth-child(6)',
	  	https: 'td:nth-child(7)',
	  	last_checked: 'td:nth-child(8)',
	}]);
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
module.exports = ProxyRequest;
