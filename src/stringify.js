'use strict';
const markerKey = Symbol('warp10');
const escapeEndingScriptTagRegExp = /<\//g;
const isArray = Array.isArray;

class Marker {
    constructor(path, symbol) {
        this.path = path;
        this.symbol = symbol;
    }
}

function append(array, el) {
    var len = array.length;
    var clone = new Array(len+1);
    for (var i=0; i<len; i++) {
        clone[i] = array[i];
    }
    clone[len] = el;
    return clone;
}

class Assignment {
    constructor(lhs, rhs) {
        this.l = lhs;
        this.r = rhs;
    }
}

function handleProperty(clone, key, value, valuePath, serializationSymbol, assignments) {
    if (value.constructor === Date) {
        assignments.push(new Assignment(valuePath, { type: 'Date', value: value.getTime() }));
    } else if (isArray(value)) {
        const marker = value[markerKey];

        if (marker && marker.symbol === serializationSymbol) {
            assignments.push(new Assignment(valuePath, marker.path));
        } else {
            value[markerKey] = new Marker(valuePath, serializationSymbol);
            clone[key] = pruneArray(value, valuePath, serializationSymbol, assignments);
        }
    } else {
        const marker = value[markerKey];
        if (marker && marker.symbol === serializationSymbol) {
            assignments.push(new Assignment(valuePath, marker.path));
        } else {
            value[markerKey] = new Marker(valuePath, serializationSymbol);
            clone[key] = pruneObject(value, valuePath, serializationSymbol, assignments);
        }
    }
}

function pruneArray(array, path, serializationSymbol, assignments) {
    let len = array.length;

    var clone = new Array(len);

    for (let i=0; i<len; i++) {
        var value = array[i];
        if (value == null) {
            continue;
        }

        if (value && typeof value === 'object') {
            handleProperty(clone, i, value, append(path, i), serializationSymbol, assignments);
        } else {
            clone[i] = value;
        }
    }

    return clone;
}

function pruneObject(obj, path, serializationSymbol, assignments) {
    var clone = {};

    for (var key in obj) {
        var value = obj[key];
        if (value == null) {
            continue;
        }

        if (value && typeof value === 'object') {
            handleProperty(clone, key, value, append(path, key), serializationSymbol, assignments);
        } else {
            clone[key] = value;
        }
    }

    return clone;
}

function stringifyHelper(obj, safe) {
    /**
     * Performance notes:
     *
     * - It is faster to use native JSON.stringify instead of a custom stringify
     * - It is faster to first prune and then call JSON.stringify with _no_ replacer
     */
    var pruned;

    const assignments = []; // Used to keep track of code that needs to run to fix up the stringified object

    if (typeof obj === 'object') {
        const serializationSymbol = Symbol(); // Used to detect if the marker is associated with _this_ serialization
        const path = [];

        obj[markerKey] = new Marker(path, serializationSymbol);

        if (obj.constructor === Date) {
            pruned = null;
            assignments.push(new Assignment([], { type: 'Date', value: obj.getTime() }));
        } else if (isArray(obj)) {
            pruned = pruneArray(obj, path, serializationSymbol, assignments);
        } else {
            pruned = pruneObject(obj, path, serializationSymbol, assignments);
        }
    } else {
        pruned = obj;
    }

    var final = {
        object: pruned
    };

    if (assignments.length) {
        final.assignments = assignments;
    }

    let json = JSON.stringify(final);
    if (safe) {
        json = json.replace(escapeEndingScriptTagRegExp, '\\u003C/');
    }

    return json;
}

module.exports = function stringify(obj, options) {
    if (obj == null) {
        return '{}';
    }

    var safe;

    if (options) {
        safe = options.safe === true;
    } else {
        safe = false;
    }

    return stringifyHelper(obj, safe);
};