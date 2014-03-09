Sligthly more capable router implementation to replace connect-router.

Main difference between connect-router and this is that this one provides more
capable static routing support that allows mapping single files to routes.

Another purpose of this router is to allow mapping of mini-modules as static content.

## Example

var connect = require("connect");
var http = require("http");

var router = require("../router.js")(function (router) {

    router.addStatic("/modules/mini-promise.js", require.resolve("mini-promise"));

    router.addStatic("/public/", __dirname + "/static/");

    router.add(["GET"], "/hello", function (req, res) {
        res.end("Hello from Connect!\n");
    });

    router.add(["GET"], "/hello/:name", function (req, res) {
        res.end("Hello: " + req.params.name + "!\n");
    });
});

var app = connect()
        .use(connect.logger())
        .use(router);
