var
    maas = require('../../lib/maas'),
    framedSocket = require('../../lib/server/framedsocket');

maas.init();

maas.config.set('settings:tls_proxy', false);
// Turning off logging increases through put by ~ 500 msg/s
maas.config.set('settings:log_level', 'none');

var port = maas.config.get('settings:port');

framedSocket.createServer(undefined, function(sock) {

    sock.on('message', function (msg) {
        var r = maas.protocol.parseRequest(msg);
        // Only send a response to valid messages
        if( r.authRequest.username === 'dave' ){
            sock.write(maas.protocol.writeResponse({
                type: 'VMREADY',
                message: "test1"
            }));
        }
    });

}).listen(port);
