'use strict';

var empowerCore = require('empower-core');

module.exports = function defaultOptions () {
    return Object.assign(empowerCore.defaultOptions(), {
        modifyMessageOnRethrow: false,
        saveContextOnRethrow: false
    });
};
