/**
 * Main namespace object used through-out the app.
 *
 * @exports maas
 */
var maas = {};

module.exports = maas;

/**
 * Current version used. Read from package.json
 * @type {String}
 */
maas.VERSION = require('../package.json').version;

/**
 * Called at start of App.  Initializes the core modules
 */
maas.init = function(configFile) {

    /**** Setup ****/

    // Winston and wrap in out global name space
    maas.logger = require('./common/logger');
    maas.logger.beforeConfig();

    maas.logger.info('Starting maas-server version %s', maas.VERSION);

    // Config with validation
    maas.config = require('./common/config');
    maas.config.init(configFile);

    maas.logger.afterConfig();

    // Protocol
    maas.protocol = require('./server/protocol');
    maas.protocol.init();

    // Models
    maas.vmSession = require('./model/vm-session');

    // Overseer Client
    var client = require('maas-overseer-client');
    maas.overseerClient = new client(maas.config.get('overseer_url'), maas.config.get('auth_token'));
};

/**
 * Shut down. Closes DB connection and cleans up any temp config settings
 */
maas.shutdown = function() {
    maas.config.reset();
}
