var
    Q = require('q'),
    jwt = require('jsonwebtoken'),
    maas = require('../maas');

/**
 * Called automatically by the proxy.
 * Assumes we will ALWAYS create and start a new VM for user and attach their storage. Storage should be
 * preset on user account creation
 *
 * @param requestObj parsed protobuf request
 * @returns {Promise|*} with a value object in the form {session: {Object}, user: {Object}}
 */
exports.authenticate = function(request) {
    // first, verify the JSON web token
    var token = request.headers["sec-websocket-protocol"];
    if (!token) {
        // return a promise-consumable error
        return Q.reject(new Error("No authentication token found"));
    }

    // we must use "ninvoke" to prevent the "verify" function from un-binding from its owner, "jwt"
    return Q.ninvoke(jwt, "verify", token, maas.config.get('overseerCert'))
        // then, if we're using client certificate auth, verify that
        .then(function (tokenPayload) {
            if (maas.config.useTlsCertAuth() && maas.config.get('behind_reverse_proxy') ) {
                // pull cert info from the special HTTP headers the reverse proxy will add
                if (! checkCert({ subject: { CN: request.headers['x-forwarded-ssl-client-s-dn-cn'] }}, tokenPayload)) {
                    throw new Error("User certificate did not match login token");
                }
            } else if (maas.config.useTlsCertAuth()) {
                // pull the client cert from the underlying TLS socket
                var rawSocket = request.connection,
                    cert = rawSocket.getPeerCertificate();
                if (rawSocket.authorized) {
                    if (! checkCert(cert, tokenPayload)) {
                        throw new Error("User certificate did not match login token");
                    }
                } else {
                    throw new Error("User certificate failed validation: " + rawSocket.authorizationError);
                }
            }
            // if we made it here without an error, return the token payload
            return tokenPayload;
        });
};

function checkCert(cert, token) {
    // verify the cert's CN matches the JWT subject
    return cert.subject.CN == token.sub;
}
