'use strict';
var _ = require( 'lodash' );
var q = require( 'q' );
var Xray = require('x-ray');
var request = require( 'request' );
var x = Xray();
var ERROR_MESSAGE = {
	NOT_AVAILABLE : 'There is no available proxy server'
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
var ProxyRequest = function( proxy_options, request_options ){
	var q = require( 'q' );
	
	var deferred = q.defer();

	getProxyList()(function( error, list ){
		if( error ){
			deferred.reject( error );
			return;
		}
		if( !list || !list.length ){
			deferred.reject( new Error( ERROR_MESSAGE.NOT_AVAILABLE ) );
			return;
		}

		if( !request_options ){
			request_options = {};
		}

		if( hasHttpsOption( proxy_options ) ){
			request_options.strictSSL = true;
			list = _.filter( list, function( proxy_server ){
				if( !proxy_server.https ){
					return false;
				}
				if( proxy_server.https === 'yes' ){
					return true;
				}
			});
		}
		if( hasUserAgentOption( proxy_options ) ){
			var useragent = USER_AGENT[ proxy_options.browser.toLowerCase() ].useragent;
			request_options.headers = { 'User-Agent': useragent };	
		}
		request_options.followRedirect = true;
    	request_options.maxRedirects = 10;

		// SELECT PROXY IP
		var promise = findAvailableProxy({
			list : list,
			request_options : request_options
		});
		deferred.resolve( promise );
		
	});
	return deferred.promise;
};

var hasHttpsOption = function( proxy_options ){
	return ( proxy_options && _.isBoolean( proxy_options.https ) && proxy_options.https === true );
};
var hasUserAgentOption = function( proxy_options ){
	return ( proxy_options && _.isString( proxy_options.browser ) && USER_AGENT[ proxy_options.browser.toLowerCase() ] );
};
var findAvailableProxy = function( params ){
	// Init params.index
	if( !_.isNumber( params.index ) ){
		params.index = 0;
	}
	// Init params.deferred
	if( !params.deferred ){
		params.deferred = q.defer();
	}
	// Init params.test_url
	if( !params.test_url ){
		params.test_url = 'http://www.google.com/robots.txt';
	}

	if( params.list.length <= params.index ){
		params.deferred.reject( new Error( 'cannot find available proxy' ) );
		return params.deferred.promise;
	}

	var selected_proxy = params.list[ params.index ];
	params.index++;
	var request_options = {};
	request_options.timeout = 10000;
	request_options.proxy = 'http://' + selected_proxy.ip + ':' + selected_proxy.port;
	var proxyrequest_test = request.defaults( request_options );
	proxyrequest_test.get( params.test_url, function( error, response ){
		if( error || 
			!response || 
			response.statusCode !== 200 ){
			process.nextTick(function(){
				findAvailableProxy( params );	
			});
			return;
		}
		// Make pure request with request_options
		if( !params.request_options ){
			params.request_options = {};
		}
		request_options.proxy = 'http://' + selected_proxy.ip + ':' + selected_proxy.port;
		var proxyrequest = request.defaults( params.request_options );
		params.deferred.resolve( proxyrequest );
	});
	return params.deferred.promise;
};

var getProxyList = function(){
	return x( 'http://www.us-proxy.org', 'table#proxylisttable tr', [{
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
module.exports = ProxyRequest;
