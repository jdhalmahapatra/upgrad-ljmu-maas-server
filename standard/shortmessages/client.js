
var
    maas = require('../../lib/maas'),
    framedSocket = require('../../lib/server/framedsocket'),
    net = require('net');

/**
 * Measure messages per second between maasSocket client and server.
 *
 */
maas.init();

// Make sure to turn TLS off
maas.config.set('settings:tls_proxy', false);

var
    port = maas.config.get('settings:port'),
    client = framedSocket.wrap(new net.Socket());
    counter = 0,
    interval = 5000,
    totalTestTime = 60000,
    data = [];


function finish () {
    console.log("** Done! ** ");
    var trimmed = data.slice(1); // Remove the first message reported by count.

    var sum = 0, average = 0;
    for (var i = 0; i < trimmed.length; i++) {
        sum += trimmed[i];
    }

    if( trimmed.length > 0 ) {
        average = sum / trimmed.length;
        console.log("Average msgs/sec: ", average);
    }
    process.exit(0);
}



function count() {
    //var value = counter / interval * 1000;
    data.push(counter / interval * 1000);
    counter = 0;
    setTimeout(count, interval);
}

client.on('message', function (msg) {
    var r = maas.protocol.parseResponse(msg);

    // Only count if you get a valid message
    if(r.message === 'test1') {
        counter++;
    }

    client.write(maas.protocol.writeRequest({
        type: 'AUTH',
        authRequest: {
            type: 'AUTHENTICATION',
            username: 'dave'
        }
    }));
});

client.on('connect', function () {
    client.write(maas.protocol.writeRequest({
        type: 'AUTH',
        authRequest: {
            type: 'AUTHENTICATION',
            username: 'dave'
        }
    }));
    count();
    setTimeout(finish, totalTestTime);
});

// GO
client.connect(port);
