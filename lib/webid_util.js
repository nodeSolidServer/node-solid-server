"use strict"

var request = require('request');
var url = require('url');
var uuid = require('uuid');
var webid = require('webid');
var rdfstore = require('rdfstore');
var debug = require('./debug').authentication


exports.create_WebIdUtils = function () {
  return new WebIdUtils();
}

/**
 * A class wrapping utility routines for WebID handling.
 * @constructor
 */
function WebIdUtils () {
}

WebIdUtils.prototype = {
  constructor: WebIdUtils,


  get_info_for_WebID: function(webId) {
    var me = this;
    var profile_tmp_graph_id = null;
    var base = null;

    return new Promise(function resolver(resolve, reject) {
      Promise.resolve(true).then(function (result) {
	// It's assumed the delegate's public key has already been checked by webid.verify()
	// Fetch the delegate's WebID profile
	//    This shouldn't fail if the delegate's WebID has already been verified.
	return me.get_profile(webId);
      }).then(function (profile) {

	// profile ::= { profile: <string>, content_type: <string> }

	return new Promise(function(resolve, reject) {
	  rdfstore.create(function(err, rdf_store) {
          
   	    profile_tmp_graph_id = 'urn:' + uuid.v4(); 
            var uriObj = url.parse(webId);
            uriObj.hash = uriObj.search = uriObj.query = null;
            var base = url.format(uriObj);
   	    var options = {graph: profile_tmp_graph_id, documentIRI:base};

	    switch(profile.content_type)
	    {
	      case 'text/turtle':
	      case 'application/ld+json':
                rdf_store.load(profile.content_type, profile.profile, options, function(err, results){
	           if (err)
	             reject (new Error('Could not parse profile :'+delegate));

	           resolve(rdf_store);
	        });
	        break;

	      default:
	        throw new Error("WebIdUtils#get_info_for_WebId: Delegate's profile: Unexpected WebID profile content type");
	    }
	  });
	});

      }).then(function (rdf_store) {
        me.store = rdf_store;

	return me.find_info_in_webId_profile(
	  me.store,
	  profile_tmp_graph_id, 
	  webId);

      }).then(function (val) {
        me.clear_graph(me.store, profile_tmp_graph_id);
	resolve(val);
      }).catch(function (e) {
//	debug('WebIdUtils#get_info_for_WebId: ', e)
	reject(e);
      });
    });
  },

  /**
   * Verifies a delegation claim.
   * Checks if the given delegate is authorized to authenticate or act on behalf of the given delegator.
   * @param {string} delegator - WebID of a 'principal' who allows a delegate to authenticate on their behalf
   * @param {string} - WebID of an agent that is assumed to be a delegate.
   * @param {object} - The delegate's certificate. This will already have been verified and used for 
   *                   authenticating the delegate as part of setting up a WebID TLS connection.
   * @returns {promise}
   */
  verify_delegation: function (delegator, delegate, delegate_certificate) {
    var me = this;
    var delegate_profile_tmp_graph_id = null;
    var delegator_profile_tmp_graph_id = null;
    var delegator_base = null;
    var stmt_on_behalf_of_exists = false;
    var stmt_delegates_exists = false;
    var stmt_has_identity_delegate_exists = false;
    var delegator_has_delegate_public_key = false;
  
    debug('WebIdUtils#verify_delegation');

    return new Promise(function resolver(resolve, reject) {
      Promise.resolve(true).then(function (result) {
	// It's assumed the delegate's public key has already been checked by webid.verify()
	// Fetch the delegate's WebID profile
	//    This shouldn't fail if the delegate's WebID has already been verified.
	return me.get_profile(delegate);
      }).then(function (profile) {
	// Load the delegate's profile into store
	
	// profile ::= { profile: <string>, content_type: <string> }
	return new Promise(function(resolve, reject) {
	  rdfstore.create(function(err, rdf_store) {
          
            rdf_store.registerCustomFunction('equalIgnoreCase', function(engine,args) {
              var v1 = engine.effectiveTypeValue(args[0]).toString();
              var v2 = engine.effectiveTypeValue(args[1]).toString();

              return engine.ebvBoolean(v1.toUpperCase() === v2.toUpperCase());
	    });


   	    delegate_profile_tmp_graph_id = 'urn:' + uuid.v4(); 
            var uriObj = url.parse(delegate);
            uriObj.hash = uriObj.search = uriObj.query = null;
            var delegate_base = url.format(uriObj);
   	    var options = {graph: delegate_profile_tmp_graph_id, documentIRI:delegate_base};

	    switch(profile.content_type)
	    {
	      case 'text/turtle':
	      case 'application/ld+json':
                rdf_store.load(profile.content_type, profile.profile, options, function(err, results){
	           if (err)
	             reject (new Error('Could not parse profile :'+delegate));

	           resolve(rdf_store);
	        });
	        break;

	      default:
	        throw new Error("WebIdUtils#verify_delegation: Delegate's profile: Unexpected WebID profile content type");
	    }
	  });
	});

      }).then(function (rdf_store) {
        me.store = rdf_store;

	// Check if the statement "<{delegate}> oplcert:onBehalfOf <{delegator}>"  is exists
	return me.statement_exists(
	  me.store,
	  delegate_profile_tmp_graph_id, 
	  delegate,
	  'http://www.openlinksw.com/schemas/cert#onBehalfOf',
	  delegator
	);

      }).then(function (result) {

	stmt_on_behalf_of_exists = result;
	debug(`WebIdUtils#verify_delegation: Statement <${delegate}> oplcert:onBehalfOf <${delegator}> exists?:`, stmt_on_behalf_of_exists);
	return me.clear_graph(me.store, delegate_profile_tmp_graph_id);

      }).then(function (result) {
	if (!stmt_on_behalf_of_exists)
	  throw(new Error(`Relation <${delegate}> oplcert:onBehalfOf <${delegator}> not found.`));
	// or equivalent:
	// if (!stmt_on_behalf_of_exists)
	//   return Promise.reject(new Error(`Relation "<${delegate}> oplcert:onBehalfOf <${delegator}>" not found.`));
	return true;

      }).then(function (result) {
	// Fetch the delegator's WebID profile 
	return me.get_profile(delegator);

      }).then(function (profile) {
	// Load the delegator's profile into store
	// profile ::= { profile: <string>, content_type: <string> }

	return new Promise(function(resolve, reject) {
   	    
          delegator_profile_tmp_graph_id = 'urn:' + uuid.v4(); 
          debug('WebIdUtils#verify_delegation: temp graph id: ', delegator_profile_tmp_graph_id);

          // base is used to expand null and relative URIs, <> and <#abc>
          var uriObj = url.parse(delegator);
          uriObj.hash = uriObj.search = uriObj.query = null;
          delegator_base = url.format(uriObj);
          var options = {graph: delegator_profile_tmp_graph_id, documentIRI: delegator_base};

	  switch(profile.content_type)
	  {
	    case 'text/turtle':
	    case 'application/ld+json':
              me.store.load(profile.content_type, profile.profile, options, function(err, results){
	         if (err)
	           reject (new Error('Could not parse profile :'+delegate));

	         resolve(me.store);
	      });
	      break;

	    default:
	      throw new Error("WebIdUtils#verify_delegation: Delegator's profile: Unexpected WebID profile content type");
	  }
	});
	
      }).then(function (rdf_store) {

	// Check if the statement "<{delegator}> oplcert:hasIdentityDelegate <{delegate}>" exists
	return me.statement_exists(
	  me.store,
	  delegator_profile_tmp_graph_id, 
	  delegator,
	  'http://www.openlinksw.com/schemas/cert#hasIdentityDelegate',
	  delegate
	);

      }).then(function (bHasIdentityDelegate) {
	stmt_has_identity_delegate_exists = bHasIdentityDelegate;
	debug(`WebIdUtils#verify_delegation: Statement <${delegator}> oplcert:hasIdentityDelegate <${delegate}> exists?:`, stmt_has_identity_delegate_exists);
	// Check if the statement "<{delegator}> acl:delegates <{delegate}>" exists
	return me.statement_exists(
	  me.store,
	  delegator_profile_tmp_graph_id, 
	  delegator,
	  'http://www.w3.org/ns/auth/acl#delegates',
	  delegate
	);

      }).then(function (bDelegates) {
	stmt_delegates_exists = bDelegates;
	debug(`WebIdUtils#verify_delegation: Statement <${delegator}> acl:delegates <${delegate}> exists: `, stmt_delegates_exists);
	// Check the delegator's profile contains the delegate's public key
	return me.find_delegate_public_key_in_delegator_profile(
	  me.store,
	  delegator_profile_tmp_graph_id, 
	  delegate, 
	  delegate_certificate.modulus, 
	  delegate_certificate.exponent);

      }).then(function (delegate_public_key_from_delegator_profile) {
	//logger.debug("WebIdUtils#verify_delegation: delegate_public_key from delegator's profile: ", delegate_public_key_from_delegator_profile);
	delegator_has_delegate_public_key = delegate_public_key_from_delegator_profile == null ? false : true;
	debug("WebIdUtils#verify_delegation: Delegator's WebID profile contains the delegate's public key?: ", delegator_has_delegate_public_key);
	return true;

      }).then(function (result) {
	return me.clear_graph(me.store, delegator_profile_tmp_graph_id);

      }).then(function (result) {
	if ((stmt_has_identity_delegate_exists || stmt_delegates_exists) && delegator_has_delegate_public_key)
	  resolve(true);
	else
	{
	  if (!delegator_has_delegate_public_key)
	    throw(new Error(`${delegator_base} does not contain the public key of <${delegate}> .`));
	  else 
	  {
	    var err_msg = `${delegator_base} contains neither <${delegator}> acl:delegates <${delegate}> `;
	    err_msg += `nor <${delegator}> oplcert:hasIdentityDelegate <${delegate}>`;
	    throw(new Error(err_msg));
	  }
	}

      }).catch(function (e) {
	debug('WebIdUtils#verify_delegation: ', e)
	reject(e);
      });
    });
  },

  /**
   * Given a WebID, retrieves the WebID profile.
   * @returns {object} - An object with properties profile and content_type.
   */
  get_profile: function (web_id) {
/****
	headers: {
	  'Accept': 'text/turtle, application/ld+json, text/html'
	}
*****/
    return new Promise(function(resolve, reject) {
      var uri = url.parse(web_id);
      var options = {
	url: uri,
	method: 'GET',
	headers: {
	  'Accept': 'text/turtle, application/ld+json'
	}
      };

      request(options, function (err, res, body) {
	if (err) {
	  return reject(new Error('Failed to fetch profile from ' + uri.href + ': ' + err))
	}

	if (res.statusCode !== 200) {
	  return reject (new Error('Failed to retrieve WebID from ' + uri.href + ': HTTP status: ' + res.statusCode))
	}

	resolve({profile: body, content_type: res.headers['content-type']});
      });
    });
  },

  statement_exists: function (store, graph, subject, predicate, object) {

    return new Promise(function(resolve, reject) {

      var qry = `ask where { graph <${graph}> { <${subject}> <${predicate}> <${object}> }}`;
      store.execute(qry, function(err, results) {
        if (err)
          reject(err);
        else
          resolve(results);

      });
    }); 
  }, // statement_exists


  clear_graph: function (store, graph) {
    return new Promise(function(resolve, reject) {

      debug ('store#clear_graph: ', `<${graph}>`);
      store.clear(graph, function(err) {
        if (err)
          reject(err);
        else
          resolve(true);
      });
    }); 
  },


  find_delegate_public_key_in_delegator_profile: function (store, graph, delegate, delegate_modulus, delegate_exponent) 
  {
    return new Promise(function(resolve, reject) {
      /* 
       * Matching exponents in a filter clause requires that we 
       * ensure the exponent in the delegate's certificate and 
       * delegator's profile use the same encoding.
       * e.g. One might be a decimal int, the other hex.
       * For now we don't bother.
       */
      var qry = `
	prefix cert: <http://www.w3.org/ns/auth/cert#> 
	select ?exponent ?modulus
	from <${graph}>
	where {
	  <${delegate}> cert:key ?key .
	  ?key cert:exponent ?exponent .
	  ?key cert:modulus ?modulus .
	  filter(custom:equalIgnoreCase(?modulus, "${delegate_modulus}"))
	} limit 1
	`;

      store.execute(qry, function(err, results) {
        if (err) {
          reject(err);
        }
        else {
          var public_key = null;
	  if (results.length == 1) {
	    public_key = {};
	    public_key.exponent = { datatype: results[0].exponent.type, value: results[0].exponent.value };
	    public_key.modulus = { datatype: results[0].modulus.type, value: results[0].modulus.value};
	  }
	  resolve(public_key);
        }

      });

    }); 
  },



  find_info_in_webId_profile: function (store, graph, webId) 
  {
    return new Promise(function(resolve, reject) {
      var qry = `
        PREFIX foaf:<http://xmlns.com/foaf/0.1/> 
        PREFIX schema: <http://schema.org/> 
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#> 
        PREFIX skos: <http://www.w3.org/2004/02/skos/core#> 
	prefix cert: <http://www.w3.org/ns/auth/cert#> 
        prefix pim: <http://www.w3.org/ns/pim/space#> 

	select *
	from <${graph}>
	where {
         {{<${webId}> schema:name ?schema_name} UNION 
         {<${webId}> foaf:name ?foaf_name} UNION 
         {<${webId}> rdfs:label ?rdfs_name} UNION 
         {<${webId}> skos:prefLabel ?skos_prefLabel} UNION 
         {<${webId}> skos:altLabel ?skos_altLabel} 
         }
         OPTIONAL {<${webId}> pim:storage ?pim_store }.
	} 
	`;

      store.execute(qry, function(err, results) {
        if (err) {
          reject(err);
        }
        else {
          var pim_store = null;
          var name = null;
	  if (results.length >= 1) {
	    var r = results[0];
            if (r.schema_name)
              name = r.schema_name.value;
            else if (r.foaf_name)
              name = r.foaf_name.value;
            else if (r.rdfs_name)
              name = r.rdfs_name.value;
            else if (r.skos_prefLabel)
              name = r.skos_prefLabel.value;
            else if (r.skos_altLabel)
              name = r.skos_altLabel.value;
	   
	    if (r.pim_store)
	      pim_store = r.pim_store.value;
	  }
	  resolve({name, pim_store});
        }

      });

    }); 
  }


}
