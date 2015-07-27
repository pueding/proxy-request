'use strict';
var _ = require( 'lodash' );
var Xray = require('x-ray');
var x = Xray();

var ProxyRequest = function( proxy_options, request_options ){
	var q = require( 'q' );
	var request = require( 'request' );
	var deferred = q.defer();

	getProxyList()(function( error, list ){
		if( error ){
			deferred.reject( error );
			return;
		}
		if( !list || !list.length ){
			deferred.reject( new Error( 'There is no available proxy server' ) );
			return;
		}
		if( isHttpsOption( proxy_options ) ){
			list = _.filter( list, function( proxy_server ){
				if( !proxy_server.https ){
					return false;
				}
				if( proxy_server.https === 'yes' ){
					return true;
				}
			});
		}

		if( !request_options ){
			request_options = {};
		}

		var selected_proxy = list[ _.random( 0, list.length - 1 ) ];
		request_options.proxy = 'http://' + selected_proxy.ip + ':' + selected_proxy.port;
		console.log( request_options.proxy );
		// request_options.proxy = 'http://45.63.53.242:3128';
		var proxyrequest = request.defaults( request_options );
		deferred.resolve( proxyrequest );
	});
	return deferred.promise;
};

var isHttpsOption = function( proxy_options ){
	return ( proxy_options && _.isBoolean( proxy_options.https ) && proxy_options.https === true );
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
