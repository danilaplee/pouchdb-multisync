#pouchdb-multisync
###for those of you using db per user auth provisioning scheme, this is the multilistening library you are waiting for
```
npm install pouchdb-multisync --save
```
then in your code:
```
var sync_tool 	 = require('pouchdb-multisync')
var config 		 = 
{
	couch:
	{
		port:6984,
		ssl:true,
		domain:'couch.url.com',
		auth:
		{
			username:'admin-username',
			password:'admin-password'
		}
	},
	sync_tool:
	{
		// If you want to relisten events on the stored memory,
		in_mem_poll_timer:10000, 
		// If you want to exclude some dbs from user based events
		non_user_dbs:['orders', 'other-non-user-db']
	},
	//here you can pass the variables for pouchdb replication
	replication:
	{
		live: true, 
    	retry: true,  
    	heartbeat:5000,
    	local_storage: require('memdown') // Default is memdown
	}
}

var db_listener  = function(local_db, db_name, docs, remote_db) 
{
	if(sync_tool.isUserDB(db_name))
	{
		for (var i = docs.length - 1; i >= 0; i--) 
		{
            var doc         = docs[i]
            var id          = doc._id
            if(!id) id      = doc.id
            var modelName   = id.split('_')[0]
            if(doc.doc) doc = doc.doc;
			if(modelName == "cloud") createCloud(local_db, db_name, doc, remote_db);
		}
	}
}

sync_tool
.bindParams(
	db_listener,
	config.couch,			
	config.sync_tool,	// THIS IS OPTIONAL
	config.replication 	// THIS IS OPTIONAL	
)
sync_tool.initSync()
```
