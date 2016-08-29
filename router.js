var fs = require("fs");
var mime = require("mime");

var Promise = require("mini-promise-aplus").Promise;

var URL = require("url");

function Router(name, logger) {
    this.name = name;

    this.logger = logger != null ? logger : {
        log: console.log,
        error: console.error ? console.error : console.log,
        debug: console.debug ? console.debug : console.debug
    };

    this.routes = {
        HEAD: [],
        GET: [],
        PUT: [],
        POST: [],
        DELETE: [],
        PATCH: []
    };
}

Router.prototype.addStatic = function (route, path) {
    var self = this;
    return new Promise(function (resolve, reject) {
        if (path.charAt(path.length - 1) === '/') {
            path = path.substr(0, path.length - 1);
        }
        fs.stat(path, function (err, stats) {
            var fileTarget = false;
            if (err) {
                reject(err);
            } else if (stats.isDirectory()) {
                fileTarget = false;
            } else if (stats.isFile()) {
                fileTarget = true;
            } else {
                reject(new Error("Asking to server static content that is not file or directory."));
            }

            var re;
            if ( route instanceof RegExp) {
                re = serverPath;
            } else {
                if (fileTarget) {
                    re = new RegExp("^" + route + "$");
                } else {
                    // Remove trailing forward slash
                    if (route.charAt(route.length - 1) === '/') {
                        route = route.substr(0, route.length - 1);
                    }
                    re = new RegExp("^" + route + "((?:/[^/]*)*)(/.*)$");
                }
            }
            self.add(["HEAD", "GET"], re, function staticRequestHandler(req, res, next) {
                new Promise(function (resolve, reject) {
                    var url = URL.parse(req.url);
                    if (fileTarget) {
                        resolve(path);
                    } else {
                        // Make security checks that requests does not try
                        // to go backwards in the filesystem if static path
                        // points to a directory.
                        if (url.pathname.match(/.*\.\..*/)) {
                            res.writeHead(403);
                            res.end("Illegal request");
                            reject(new Error("Trying to access paths with \"..\", that is forbidden."));
                        } else {
                            var filename = null;
                            var pathMatch = url.pathname ? url.pathname.match(re) : null;
                            try {
                                if (pathMatch) {
                                    if (fileTarget) {
                                        filename = path;
                                    } else if (pathMatch[1].length > 0 && pathMatch[2].length > 0) {
                                        filename = path + pathMatch[1] + pathMatch[2];
                                    } else if (pathMatch[1].length === 0 && pathMatch[2].length > 0) {
                                        filename = path + pathMatch[2];
                                    } else {
                                        reject();
                                        return;
                                    }
                                    resolve(filename);
                                } else {
                                    reject();
                                }
                            } catch (e) {
                                reject(e);
                            }
                        }
                    }
                }).then(function (filename) {
                    return new Promise(function (resolve, reject) {
                        fs.stat(filename, function (err, stats) {
                            if (err) {
                                reject(err);
                            } else {
                                resolve({ filename: filename, modified: stats.mtime, contentLength: stats.size });
                            }
                        });
                    });
                }).then(function (info) {
                    info.mimetype = mime.lookup(info.filename);
                    info.charset = mime.charsets.lookup(info.mimetype);
                    return info;
                }).then(function (info) {
                    var modifiedSince = 0;
                    if (req.headers["if-modified-since"]) {
                        modifiedSince = Date.parse(req.headers["if-modified-since"]);
                        if (modifiedSince !== NaN && modifiedSince > info.modified) {
                            res.writeHead(304, {
                                "Content-Type": info.mimetype + (info.charset ? "; charset=" + info.charset : ""),
                                "Last-Modified": info.modified.toUTCString(),
                                "Content-Length": info.contentLength
                            });
                            res.end();
                            resolve();
                            return;
                        }
                    }
                    if (req.method.toUpperCase() === "HEAD") {
                        res.writeHead(200, {
                            "Content-Type": info.mimetype + (info.charset ? "; charset=" + info.charset : ""),
                            "Last-Modified": info.modified.toUTCString(),
                            "Content-Length": info.contentLength
                        });
                        res.end();
                        resolve();
                        return;
                    } else {
                        return new Promise(function (resolve, reject) {
                            var fileStream = fs.createReadStream(info.filename, { encoding: info.charset });
                            var headersSend = false;
                            fileStream.on("open", function () {
                            });
                            fileStream.on("data", function (data) {
                                if (!headersSend) {
                                    res.writeHead(200, {
                                        "Content-Type": info.mimetype + (info.charset ? "; charset=" + info.charset : ""),
                                        "Last-Modified": info.modified.toUTCString(),
                                        "Transfer-Encoding": "chunked",
                                        "Content-Length": info.contentLength
                                    });
                                    headersSend = true;
                                }
                                res.write(data);
                            });
                            fileStream.on("end", function() {
                                res.end();
                                resolve();
                            });
                            fileStream.on("error", function(err) {
                                if (err && err.code && err.code === "ENOENT") {
                                    reject();
                                } else if (err && err.code && err.code === "EACCES") {
                                    res.writeHead(401);
                                    res.end("Access denied");
                                    resolve();
                                } else if (err && err.code && err.code === "EISDIR") {
                                    // redirect to index.html in the requested path
                                    var redirectTo = req.url;
                                    if (redirectTo[redirectTo.length - 1] === '/') {
                                        redirectTo = redirectTo + "index.html";
                                    } else {
                                        redirectTo = redirectTo + "/index.html";
                                    }
                                    self.logger.log("Requested directory, redirect to: " + redirectTo);
                                    res.writeHead(307, {
                                        "Location": redirectTo
                                    });
                                    // res.writeHead(401);
                                    // res.end("Directory listing is not allowed");
                                    res.end();
                                    resolve();
                                } else {
                                    res.writeHead(500);
                                    res.end("Failed to fulfill the request");
                                    resolve();
                                }
                            });
                        });
                    }
                }).then(function () {
                    resolve();
                }, function (reason) {
                    if (!reason) {
                        res.writeHead(500);
                        res.end("Failed to fulfill the request");
                        resolve();
                    } else {
                        next();
                    }
                });
            });
        });
        resolve();
    });
};

Router.prototype.add = function (methods, route, handler) {
    var self = this;
    return new Promise(function (resolve, reject) {
        var re = route;
        var params = [];
        if (!(route instanceof RegExp)) {
            var match = route.match(/\/\:[^\/]+/g);
            if (match instanceof Array) {
                // get variable names matching from url schema
                params = match.map(function (matches) {
                    // get rid of prefix "/:"
                    return matches.substr(2);
                });
            }
            re = new RegExp("^" + route.replace(/((\/)\:[^\/]+)/g, "\/([^\/]+)") + "$");
        }
        if (typeof methods === "string") {
            if (typeof self.routes[methods.toUpperCase()] !== "undefined") {
                self.routes[methods.toUpperCase()].push({ regex: re, fn: handler, params: params });
            } else {
                throw new Error("Unsupported method: " + method.toUpperCase());
            }
        } else if (methods instanceof Array) {
            // Check that all methods area good, before adding any
            methods.forEach(function (method) {
                if (typeof method !== "string") {
                    throw new Error("Method needs to be as string");
                } else if (typeof self.routes[method.toUpperCase()] === "undefined") {
                    throw new Error("Unsupported method: " + method.toUpperCase());
                }
            });
            methods.forEach(function (method) {
                self.routes[method.toUpperCase()].push({regex: re, fn: handler, params: params});
            });
        } else {
            throw new Error("Unsupported type passed as method");
        }
        resolve();
    });
};

Router.prototype.match = function (method, path) {
    var matches = this.routes[method].reduce(function (matching, handler) {
        var match = path.match(handler.regex);
        var params = null;
        if (match && handler.fn.name === "staticRequestHandler") {
            matching.push({regexp: handler.regex, fn: handler.fn, params: params});
        } else if (match && match.length === handler.params.length + 1) {
            if (match.length > 1) {
                params = {};
                handler.params.forEach(function (param, index) {
                    params[param] = match[index + 1];
                });
            }
            matching.push({regexp: handler.regex, fn: handler.fn, params: params});
        }
        return matching;
    }, []);
    return matches;
};

Router.prototype.static = function (route, path) {
    return this.addStatic(route, path);
};

Router.prototype.get = function (route, handler) {
    return this.add(["GET", "HEAD"], route, handler);
};

Router.prototype.put = function (route, handler) {
    return this.add("PUT", route, handler);
};

Router.prototype.post = function (route, handler) {
    return this.add("POST", route, handler);
};

Router.prototype.delete = function (route, handler) {
    return this.add("DELETE", route, handler);
};

Router.prototype.head = function (route, handler) {
    return this.add("HEAD", route, handler);
};

Router.prototype.patch = function (route, handler) {
    return this.add("PATCH", route, handler);
};

Router.prototype.connect = function () {
    var self = this;
    return function (req, res, next) {
        var url = URL.parse(req.url);
        var matches = self.match(req.method, url.pathname);
        function iterate() {
            if (matches.length > 0 ) {
                var handler = matches.splice(0, 1)[0];
                try {
                    req.params = handler.params;
                    handler.fn(req, res, iterate);
                } catch (e) {
                    self.logger.error("Handler failed: ", e);
                    self.logger.error(e.stack);
                    iterate();
                }
            } else {
                next();
            }
        }
        iterate();
    };
};

module.exports.Router = Router;
