'use strict';
var proxyrequest = require( '../' );
describe('ProxyRequest()', function(){
	it('should return proxy request', function(done){
		this.timeout( 60000 );
		proxyrequest({ https : true, browser : 'chrome' })
		.then( function( request ){
			request( 'https://www.airbnb.com/terms', function( error, response, body ){
				console.log( error );
				console.log( body );
				if( response.statusCode === 200 ){
					done();
					return;
				}
				console.log( response.statusCode );
				done( false );
			});
			
		})
		.then( null, function( error ){
			console.error( error );
			done( error );
		});

	});

	it('should return proxy request', function(done){
		this.timeout( 60000 );
		proxyrequest({ https : true, browser : 'chrome' })
		.then( function( request ){
			request( 'https://www.google.com', function( error, response, body ){
				console.log( error );
				console.log( body );
				if( response.statusCode === 200 ){
					done();
					return;
				}
				console.log( response.statusCode );
				done( false );
			});
			
		})
		.then( null, function( error ){
			console.error( error );
			done( error );
		});

	});
});
