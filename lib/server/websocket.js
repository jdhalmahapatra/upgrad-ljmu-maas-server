var
    maas = require('./../maas'),
    http = require('http'),
    https = require('https'),
    WebSocketServer = require('ws').Server;

exports.createServer = function (options, connectionListener) {
    function processRequest(req, res) {
        // websocket upgrade bypasses this
        // no other types of HTTP request are allowed, so send back a 403
        console.log('blah');
        res.statusCode = 403;
        res.end("Go away");
    }

    var app = null;
    options = options || {};

    if (maas.config.get('enable_ssl')) {
        app = https.createServer(maas.config.get('tls_options'), processRequest );
    } else {
        app = http.createServer(processRequest);
    }

    var wss = new WebSocketServer({server: app});
    wss.on('connection', connectionListener);

    return app;
};
