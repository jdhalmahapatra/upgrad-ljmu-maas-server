var
    maas = require('./../maas'),
    Q = require('q');

/**
 * Create a VM session for the User
 * @param username of user
 * @param connectTime, Date the user opened this connection
 * @param expireAt, Date the VM Session expires
 * @returns promise
 */
exports.create = function (token) {
    var username = token.sub;
    var connectTime = new Date();
    var expireAt = token.exp;

    maas.logger.verbose("Calling overseer: services/vm-session for user '%s'", username);

    // return a promise to execute the REST API call
    return Q.ninvoke(maas.overseerClient, 'createVMSession', username, connectTime, expireAt)
        .then(function (res) {
            if (res.status !== 200)
                throw new Error("session create failed, response code: " + res.status + ", text: " + res.text);

            // if we get to this point without an error, we can return an object with the VM Session properties
            return {username: username, connectTime: connectTime, expireAt: expireAt};
        }, function (err) {
            // Overseer Client callback error message isn't descriptive enough, append this prefix message
            throw new Error("session create failed: " + err.message);
        });
        // no catch, pass errors to the parent
};

/**
 * Updates the user's VM session activity date/time when they disconnect
 * @param username of user
 * @param connectTime, Date the user opened this connection
 * @param lastAction, Date the user disconnected
 * @returns promise
 */
exports.updateActivity = function (username, connectTime) {
    var lastAction = new Date();

    maas.logger.verbose("Calling overseer: services/vm-session for user '%s'", username);

    // return a promise to execute the REST API call
    return Q.ninvoke(maas.overseerClient, 'updateVMSession', username, connectTime, lastAction)
        .then(function (res) {
            if (res.status !== 200)
                throw new Error("session update failed, response code: " + res.status + ", text: " + res.text);
        }, function (err) {
            // Overseer Client callback error message isn't descriptive enough, append this prefix message
            throw new Error("session update failed: " + err.message);
        });
        // no catch, pass errors to the parent
};
