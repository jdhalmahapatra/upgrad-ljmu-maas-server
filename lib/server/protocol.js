var
    protobuf = require("protobufjs"),
    ByteBuffer = require('bytebuffer'),
    path = require('path'),
    maas = require('../maas');

var protocol = exports;

/**
 * Load .proto file and configure
 */
protocol.init = function() {
    var builder = protobuf.loadProtoFile(path.join(__dirname, "../../protocol/maas.proto"));
    this.Request = builder.build("maas.Request");
    this.Response = builder.build("maas.Response");

    // Hack to read Enums by the name.  Protobufjs doesn't support this natively
    this.requestEnums = toEnumLookup(builder.lookup("maas.Request.RequestType").children);
    this.responseEnums = toEnumLookup(builder.lookup("maas.Response.ResponseType").children);
};

/**
 * Decode an maas Request
 * @param msg
 * @returns {!protobuf.Builder.Message|*|protobuf.Builder.Message}
 */
protocol.parseRequestDelimited = function (msg) {
    var buf = ByteBuffer.wrap(msg);
    buf.readVarint();
    var request = this.Request.decode(buf);
    request.type = this.requestEnums[request.type];

    debugLogWrapper('Reading Request, type: ', request);

    return request;
};

/**
 * Decode an maas Request
 * @param msg
 * @returns {!protobuf.Builder.Message|*|protobuf.Builder.Message}
 */
protocol.parseRequest = function (msg) {
    var buf = ByteBuffer.wrap(msg);
    var request = this.Request.decode(buf);
    request.type = this.requestEnums[request.type];

    debugLogWrapper('Reading Request, type: ', request);

    return request;
};

/**
 * Write a delimited message to Protobuf Request format
 * @param req in object format
 * @returns {*}
 */
protocol.writeRequest = function (req) {
    debugLogWrapper('Sending Request, type: ', req);
    var protoMsg = new this.Request(req).encode();
    return writeDelimited(protoMsg);
};

/**
 * Decode a Protobuf response
 * @param msg
 * @returns {!protobuf.Builder.Message|*|protobuf.Builder.Message}
 */
protocol.parseResponse = function (msg) {
    var buf = ByteBuffer.wrap(msg);
    var response = this.Response.decode(buf);
    response.type = this.responseEnums[response.type];

    debugLogWrapper('Reading Response, type: ', response);

    return response;
};

/**
 * Write a delimited message to Protobuf Response format
 * @param resp
 * @returns {*}
 */
protocol.writeResponse = function (resp) {

    debugLogWrapper('Sending Response, type: ', resp);

    var protoMsg = new this.Response(resp).encode();
    return writeNonDelimited(protoMsg);
};

/**
 * Write a delimited message to Protobuf Response format
 * @param resp
 * @returns {*}
 */
protocol.writeResponseDelimited = function (resp) {

    debugLogWrapper('Sending Response, type: ', resp);

    var protoMsg = new this.Response(resp).encode();
    return writeDelimited(protoMsg);
};

/**
 * Logging hook helper
 * @param messagetype
 * @param obj
 */
function debugLogWrapper(messagetype, obj) {
    var logLevel = maas.config.get('log_level');
    var logFilter = maas.config.get('log_request_filter');

    // if this Request type isn't in our list of filters, log this message
    if ((logLevel === 'debug' || logLevel === 'silly') && logFilter.indexOf(obj.type) == -1) {
        maas.logger.debug(messagetype + obj.type);
        if (logLevel === 'silly')
          maas.logger.silly("  Body: " + JSON.stringify(obj, stringifyFilter));
    }
}

// filter values that are stringified in Request/Response objects so we don't spam the log file
// with output from large arrays of data (i.e. byte arrays)
function stringifyFilter(key, value) {
  if (value === null) {
    return undefined;
  } else if (value instanceof Array) {
    if (value.length == 0) {
      return undefined;
    } else if (value.length > 10) {
      return "[filtered 'repeated'...]";
    }
  }
  else if (value.array && value.view) {
    // this value is a ByteString, filter it
    return "[filtered 'bytes'...]";
  }
  else if (key === "password" || key === "newPassword") {
    return "[hidden]";
  }

  return value;
}

function toEnumLookup(list) {
    var out = {};
    list.forEach(function (element, index, array) {
        out[element.id] = element.name;
    });
    return out;
}

function writeDelimited(protoMessage) {
    var msgSize = protoMessage.length;
    // TODO: The 1 below is not needed....
    var buffer = new ByteBuffer(1 + msgSize);
    buffer.writeVarint(msgSize);
    buffer.append(protoMessage);
    buffer.flip();
    return buffer.toBuffer();
}

function writeNonDelimited(protoMessage) {
    var msgSize = protoMessage.length;
    var buffer = new ByteBuffer(msgSize);
    buffer.append(protoMessage);
    buffer.flip();
    return buffer.toBuffer();
}
