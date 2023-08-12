module.exports = {
    "required": true,
    "type": "object",
    "properties": {
        "port": {
            "minimum": 1,
            "maximum": 65535,
            "type": "number"
        },
        // authentication options
        "cert_user_auth": {
            "type": "boolean"
        },
        "behind_reverse_proxy": {
            "type": "boolean"
        },
        // ssl options
        "enable_ssl": {
            "type": "boolean"
        },
        "server_certificate": {
            "type": "string"
        },
        "private_key": {
            "type": "string"
        },
        "private_key_pass": {
            "type": "string"
        },
        "ca_cert": {
            "type": "string"
        },
        // overseer settings
        "overseer_url": {
            "required": true,
            "type": "string"
        },
        "overseer_cert": {
            "required": true,
            "type": "string"
        },
        "auth_token": {
            "required": true,
            "type": "string"
        },
        // logging options
        "log_file": {
            "required": true,
            "type": "string"
        },
        "log_level": {
            "enum": ["silly", "debug", "verbose", "info", "warn", "error"],
            "type": "string"
        },
        "log_request_filter": {
            "type": "array"
        },
        // webrtc options
        "webrtc": {
            "required": true,
            "type": "object",
            "properties": {
                "ice_servers": {
                    "required": true,
                    "minItems": 0,
                    "type": "array",
                    "items": {
                        "required": true,
                        "type": "object",
                        "properties": {
                            "url": {
                                "required": true,
                                // TODO: add pattern validation for stun:host:port URL
                                "type": "string"
                            },
                            "username": {
                                "type": "string"
                            },
                            "password": {
                                "type": "string"
                            }
                        }
                    }
                },
                "pc": {
                    "type": "object",
                },
                "video": {
                    "type": "object",
                }
            }
        }
    }
};
