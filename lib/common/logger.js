var
    maas = require('./../maas'),
    path = require('path'),
    winston = require('winston');

module.exports = winston;

winston.beforeConfig = function () {
    winston.remove(winston.transports.Console);
    winston.add(winston.transports.Console, {level: 'info', colorize: true, timestamp: true});
};

winston.afterConfig = function () {
    var logLevel = maas.config.get('log_level');
    var logFile = maas.config.get('log_file');

    winston.remove(winston.transports.Console);
    winston.add(winston.transports.Console, {level: logLevel, colorize: true, timestamp: true});
    winston.add(winston.transports.File, {filename: logFile, level: logLevel, json: true});
};
