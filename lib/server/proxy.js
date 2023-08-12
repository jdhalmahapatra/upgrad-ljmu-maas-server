var
    maas = require('../maas'),
    auth = require('./authentication'),
    net = require('net'),
    Q = require('q'),
    framedSocket = require('./framedsocket');

/**
 * States used by proxy
 */
var UNAUTHENTICATED = 1;
var AUTHENTICATED = 2;
var VMREADY_WAIT = 3;
var PROXYREADY = 4;

exports.handleConnection = function (clientSocket) {
    // helper function to send JSON message as a Response protobuf
    clientSocket.response = function(message) {
        clientSocket.send(maas.protocol.writeResponse(message), {binary: true});
    };

    // these are common variables that we can't initialize outside of the function
    var logDebug = maas.config.get('log_level') === 'debug',
        logSilly = maas.config.get('log_level') === 'silly',
        videoResponseObj = maas.config.getVideoResponse();

    // we have to store state variables in the clientSocket object
    clientSocket.info = {
        'state': UNAUTHENTICATED,
        'vmSocket': framedSocket.wrap(new net.Socket()),
        'vmSocketClosed': false,
        'clientSocketClosed': false,
        'remoteAddress': clientSocket.upgradeReq.connection.remoteAddress,
        'remotePort': clientSocket.upgradeReq.connection.remotePort
    };

    maas.logger.info('New connection from %s:%d',
        clientSocket.info.remoteAddress, clientSocket.info.remotePort);

    // 1) Check validity of the provided auth token
    maas.logger.debug('Attempting to authenticate client...');

    auth.authenticate(clientSocket.upgradeReq)
    .then(function (token) {
        clientSocket.info.username = token.sub;
        maas.logger.info("User '%s' (%s:%d) authenticated",
            clientSocket.info.username, clientSocket.info.remoteAddress, clientSocket.info.remotePort);

        clientSocket.info.state = AUTHENTICATED;

        // then, create a session object
        maas.vmSession.create(token)
        .then(function(obj) {
            clientSocket.info.vmSession = obj;
            clientSocket.info.username = obj.username; // store this separately from vmSession

            // Connect to VM after setup
            maas.logger.verbose('Calling overseer: services/cloud/setupVm/%s', clientSocket.info.username);

            Q.ninvoke(maas.overseerClient, 'setupVM', clientSocket.info.username)
            .then(function (response) {
                if (response.status != 200)
                    throw new Error("REST API rejected setupVm request, code: " + response.status);

                var user = response.body;
                clientSocket.info.vmAddress = user.vm_ip;

                maas.logger.verbose("Connecting to VM %s...", user.vm_ip);
                clientSocket.info.vmSocket.connect(user.vm_port, user.vm_ip, function () {
                    maas.logger.info("User '%s' (%s:%d) connected to VM at %s:%d",
                        clientSocket.info.username,
                        clientSocket.info.remoteAddress, clientSocket.info.remotePort,
                        user.vm_ip, user.vm_port);

                    clientSocket.info.state = VMREADY_WAIT;

                    // send json VIDEO_INFO
                    clientSocket.info.vmSocket.write(maas.protocol.writeRequest({"type": "VIDEO_PARAMS", "videoInfo": videoResponseObj}));

                    maas.logger.debug("User '%s' session state changed to VMREADY_WAIT", clientSocket.info.username);
                });
            }).catch( function (err) {
                maas.logger.error('Error looking up VM: %s', err.message);
                clientSocket.response({type: 'ERROR'});
                clientSocket.close(4001, 'setup.onLogin failed: ' + err.message);
            }).done();
        })
        .catch(function(err) {
            maas.logger.error('Session setup failure: %s', err.message);
            clientSocket.response({type: 'ERROR'});
            clientSocket.close(4001, 'setup.onLogin failed: ' + err.message);
        }).done();

    }).catch( function (err) {
        maas.logger.error("Client %s:%d failed authentication: %s",
            clientSocket.info.remoteAddress, clientSocket.info.remotePort, err.message);
        clientSocket.response({type: 'AUTH', authResponse: {type: 'AUTH_FAIL'}});
        clientSocket.close(4002, 'Failed authentication: ' + err.message);
    }).done();

    clientSocket.on('message', function (message, flags) {
        if (flags.binary) {
            if (clientSocket.info.state === PROXYREADY ) {
                if (logDebug || logSilly)
                    // client requests are delimited for the VM
                    maas.protocol.parseRequestDelimited(message); // parse the request and log it
                clientSocket.info.vmSocket.write(message);
            }
        } else {
            // unexpected string message
            // ignore it
        }
    });

    clientSocket.info.vmSocket.on('message', function (message) {

        if (clientSocket.info.state === VMREADY_WAIT) {
            var response = maas.protocol.parseResponse(message);
            if (response.type === 'VMREADY') {
                clientSocket.info.state = PROXYREADY;
                maas.logger.verbose("State changed to PROXYREADY");
                // the proxy is now ready for normal activity, create an interval to monitor this vmSession
                startVMSessionTimeout();
            }
        }
        else if (logDebug || logSilly)
            maas.protocol.parseResponse(message); // parse the response and log it

        clientSocket.send(message, {binary: true});
    });

    /**
     * When the client socket closes, close the VM connection
     */
    clientSocket.on("close", function (code, message) {
        maas.logger.debug("clientSocket closed: (%d) %s", code, message);
        shutdownClient();
    });

    /**
     * If the client socket runs into an error, shut everything down
     */
    clientSocket.on("error", function (err) {
        // prevent spam before the socket closes
        if (!clientSocket.info.clientSocketClosed) {
            maas.logger.error("clientSocket:", err);
        }
        shutdownClient();
    });

    /**
     * When the VM socket closes, close the client connection
     */
    clientSocket.info.vmSocket.on('close', function (had_error) {
        maas.logger.debug("Connection to VM %s closed",
            clientSocket.info.vmAddress);
        shutdownVM();
    });

    /**
     * If the VM socket times out, shut everything down
     */
    clientSocket.info.vmSocket.on('timeout', function () {
        maas.logger.debug("Connection to VM %s timed out",
            clientSocket.info.vmAddress);
        shutdownVM();
    });

    /**
     * If the VM socket runs into an error, shut everything down
     */
    clientSocket.info.vmSocket.on("error", function (err) {
        // prevent spam before the socket closes
        if (!clientSocket.info.vmSocketClosed) {
            maas.logger.error("Error communicating with VM %s: %s",
                clientSocket.info.vmAddress, err.message);
        }
        shutdownVM();
    });

    /*
     * Ensures that sockets and intervals are closed, and that vmSession information has been updated
     * This function shuts down the client socket first, then the VM socket
     */
    function shutdownClient() {
        if (!clientSocket.info.clientSocketClosed) {
            clientSocket.info.clientSocketClosed = true;
            if (clientSocket.info.username == null) {
                maas.logger.info("Unauthenticated client %s:%d disconnected",
                    clientSocket.info.remoteAddress, clientSocket.info.remotePort);
            } else {
                maas.logger.info("User '%s' (%s:%d) disconnected",
                    clientSocket.info.username, clientSocket.info.remoteAddress,
                    clientSocket.info.remotePort);
            }

            // the user disconnected, inform the REST API server
            updateVMSession();

            // stop the timeout for vmSession management
            stopVMSessionTimeout();

            clientSocket.terminate();

            // now that the client socket is closed, we can close the VM socket
            if (typeof clientSocket.info.vmAddress !== 'undefined')
                shutdownVM();
        }
    }

    /*
     * Ensures that sockets and intervals are closed, and that vmSession information has been updated
     * This function shuts down the VM socket first, then the client socket
     */
    function shutdownVM() {
        if (!clientSocket.info.vmSocketClosed) {
            clientSocket.info.vmSocketClosed = true;
            maas.logger.info("Disconnecting user '%s' (%s:%d) from VM %s ",
                clientSocket.info.username,
                clientSocket.info.remoteAddress, clientSocket.info.remotePort,
                clientSocket.info.vmAddress);
            try {
                clientSocket.info.vmSocket.end();
                clientSocket.info.vmSocket.destroy();
            } catch (e) {
                maas.logger.error("Error closing VM socket: " + e);
            }

            // now that the VM socket is closed, we can close the client socket
            shutdownClient();
        }
    }

    /**
     * Informs the REST API server that the vmSession is no longer active; this starts the idle
     * VM termination countdown
     */
    function updateVMSession() {
        if (clientSocket.info.vmSession != null) {
            // requiring connectTime makes sure we don't update this VMSession after the user reconnected
            // (for instance, if a user connects with a second device while the first one is connected)
            var connectTime = clientSocket.info.vmSession.connectTime;

            clientSocket.info.vmSession = null; // prevent the vmSession timeout from firing off
            maas.vmSession.updateActivity(clientSocket.info.username, connectTime)
            .then(function (result) {
                maas.logger.verbose("vmSession for user '%s' updated successfully",
                    clientSocket.info.username);
            }).catch(function (err) {
                maas.logger.error("updateVMSession for user '%s' failed: %s",
                    clientSocket.info.username, err.message);
            }).done();
        }
    }

    /**
     * Runs a timeout to terminate idle vmSessions
     */
    function startVMSessionTimeout() {
        if (clientSocket.info.vmSession === null)
            return;

        var expireMillis = (new Date(clientSocket.info.vmSession.expireAt * 1000) - new Date());
        maas.logger.verbose("vmSession for '%s' expires in %d seconds", clientSocket.info.username, expireMillis / 1000);

        clientSocket.info.vmSessionTimeout = setTimeout(
            function () {
                if (clientSocket.info.vmSession === null) {
                    // in rare cases, this timeout can kick off after this socket has been closed
                    // in that case, make sure the interval is stopped, then exit the function
                    stopVMSessionTimeout();
                    return;
                }

                maas.logger.info("vmSession for '%s' is expired, terminating connection", clientSocket.info.username);

                clientSocket.response({type: "AUTH", authResponse: {type: "SESSION_MAX_TIMEOUT"}});
                clientSocket.close(4002, "SESSION_MAX_TIMEOUT");
            },
            expireMillis
        );
    }

    /*
     * Stops the interval that is running
     */
    function stopVMSessionTimeout() {
        if (clientSocket.info.vmSessionTimeout !== null) {
            clearTimeout(clientSocket.info.vmSessionTimeout);
            clientSocket.info.vmSessionTimeout = null;
        }
    }

};
