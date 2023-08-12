var
    maas = require(__dirname + '/../lib/maas'),
    proxy = require(__dirname + '/../lib/server/proxy'),
    webSocket = require(__dirname + '/../lib/server/websocket');

maas.init();

var port = maas.config.get('port');
var with_tls = maas.config.get('enable_ssl');

webSocket.createServer(undefined,proxy.handleConnection).listen(port);
maas.logger.info('Listening on port %d', port);
if (with_tls) {
    maas.logger.info('SSL is enabled');
} else {
    maas.logger.info('SSL is disabled');
}
