var
    maas = require('../../lib/maas'),
    framedSocket = require('../../lib/server/framedsocket');

maas.init();

maas.config.set('settings:tls_proxy', false);
maas.config.set('settings:log_level', 'debug');
var port = maas.config.get('settings:port');

framedSocket.createServer(undefined, function(sock) {

    sock.on('message', function (msg) {
        var r = maas.protocol.parseRequest(msg);
        // Only send a response to valid messages
        if(r.type === 'WEBRTC' ) {
            sock.write(msg);
        }
    });

}).listen(port);
