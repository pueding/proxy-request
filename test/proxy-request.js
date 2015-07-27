'use strict';
var proxyrequest = require( '../' );
describe('ProxyRequest()', function(){
	it('should return proxy request', function(done){
		this.timeout( 10000 );
		proxyrequest()
		.then( function( request ){
			request( 'http://www.google.com', function( error, response, body ){
				console.log( body );
				done();
			});
			
		})
		.then( null, function( error ){
			console.error( error );
			done( error );
		});

	});
});
