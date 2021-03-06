var PouchDB 	 = require('pouchdb')
PouchDB.setMaxListeners(1000)
var couchdb 	 = require('felix-couchdb')
var local_dbs 	 = [];
var local_store  = [];
var remote_store = [];
var replications = [];
var changeListener;
var pollTimer;
var couch_conf;
var non_user_dbs;
var helper =
{
	config: 
    {
    	live: true, 
    	retry: true,  
    	heartbeat:5000,
    	local_storage:require('memdown')
    },
	newUser:function(user)
	{
	    if(!user) return null;
	    if(user == '') return null;
	    for (var n = local_dbs.length - 1; n >= 0; n--) if(local_dbs[n] == user) return null;
	    return true;
	},
	isUserDB:function(db_name)
	{
		if(non_user_dbs) for (var i = non_user_dbs.length - 1; i >= 0; i--) if(non_user_dbs[i] == db_name) return null;
	    if(db_name[0] != '_') return true;
	    return null;
	},
	parseSyncError:function(title, err, db_name)
	{
	  console.error('======== '+title+' '+db_name+' =======')
	  console.error(err)
	  console.error('======================')
	},
	getDbs:function()
	{
		return local_dbs;
	},
	getDb:function(db_name)
	{
		return local_store[db_name];
	},
	getRemote:function(db_name)
	{
		return remote_store[db_name];
	},
	dbListener:function(db, db_name, change, remote)
	{
	    var docs = change.change.docs

	    if(db_name == '_users')
	    {
	        for (var i = docs.length - 1; i >= 0; i--) 
	        {
	            if(helper.newUser(docs[i].name))
	            {
	                console.log('========= new user '+docs[i].name+' ===========')
	                helper.syncDBs(docs[i].name);
	            }
	        }
	    };
	    console.log('====== db_name '+db_name+' has changed =====')
	    changeListener(db, db_name, docs, remote);
	},
	syncDBs:function(db_name)
	{
	    console.log('======== syncing database '+db_name+' =======')
	    local_dbs.push(db_name)
	    if(couch_conf.ssl) var protocol = 'https://';
	    else var protocol = 'http://';
		var couch_string = protocol+couch_conf.domain+':'+couch_conf.port+'/'
	    var local        = new PouchDB(db_name, {db : helper.config.local_storage});
	    var remote_url   = couch_string+db_name
	    var remote       = new PouchDB(remote_url, {auth: couch_conf.auth})
	    local_store[db_name] 	= local;
	    remote_store[db_name] 	= remote;
	    replications[db_name] 	= local
	    .sync(remote, helper.config)
	    .on('error', function (err) 
	    {
	        helper.parseSyncError('sync error', err, db_name)
			replications[db_name].cancel()
			helper.syncDBs(db_name);
	    })
	    .on('denied',function (err) 
	    {
	        helper.parseSyncError('sync denied', err, db_name)
	    })
	    .on('change', function(c) 
	    { 
	        helper.dbListener(local, db_name, c, remote) 
	    })
	    .on('complete', function (info)
	    {
	        console.log('======= sync for db '+db_name+' complete ======')
	        console.log(info)
	        console.log(info.push.errors)
	        console.log('===============================================')
			replications[db_name].cancel()
	        helper.syncDBs(db_name);
	    })

	},
	replicateToRemote:function(db_name)
	{
		var local 		= helper.getDb(db_name)
		var remote 		= helper.getRemote(db_name)
		var replication = local.replicate.to(remote)
		replication.on('complete', function(status)
		{
			replication.cancel()
			replications[db_name].cancel()
			helper.syncDBs(db_name);
			console.log('====== replication complete =====')
			console.log(status)
		})
		.on('error', function (err) 
		{
			console.error('====== replication error =====')
			console.error(err)
			replication.cancel()
			helper.replicateToRemote(db_name)
		});
	},
	resolvePoll:function(db, db_name, remote)
	{
		db
		.allDocs({include_docs : true})
		.then(function(data)
		{
			var docs = data.rows
			changeListener(db, db_name, docs, remote)
		})
		.then(function(result)
		{
			if(result) console.log('poll result:',result)
		})
		.catch(function(result)
		{
			console.log('===== errored cloud on poll =====')
			console.log(result)
		})
	},
	memPoll:function()
	{
		var local_dbs = helper.getDbs()
		for (var i = local_dbs.length - 1; i >= 0; i--) 
		{
			var db_name = local_dbs[i]
			if(!helper.isUserDB(db_name)) continue;
			var db 		= helper.getDb(db_name)
			var remote 	= helper.getRemote(db_name)
			helper.resolvePoll(db, db_name, remote)
		}
	},
	initSync:function()
	{
		var client = couchdb.createClient(
			couch_conf.port, 
			couch_conf.domain,
			couch_conf.auth.username, 
			couch_conf.auth.password,
			500,
			true
		);
	    client.request(
	    {
	      path: '/_all_dbs',
	      full: true
	    }, function(err,data)
	    {
	        if(err)
	        {
	            console.error('======= error on init sync =======')
	            throw new Error(err.reponseText);
	        }
	        var databases = data.json
	        for (var i = databases.length - 1; i >= 0; i--) if(helper.isUserDB(databases[i]) || databases[i] == '_users') helper.syncDBs(databases[i]);
	        if(pollTimer) setInterval(helper.memPoll, pollTimer);
	    })
	},
	bindParams:function(onChange, couch_config, sync_conf, rep_conf)
	{
		if(!onChange || typeof onChange != 'function') throw new Error('invalid change listener');
		if(!couch_config) throw new Error('no couch config');
		changeListener 		= onChange;
		couch_conf 			= couch_config;
		if(rep_conf)	helper.config = rep_conf
		if(sync_conf)
		{
			pollTimer 	 = sync_conf.in_mem_poll_timer;
			non_user_dbs = sync_conf.non_user_dbs;
		}
	}
}
module.exports = helper