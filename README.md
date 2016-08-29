mini-router
===========

Connect router implementation providing more fine grained static routing

Mini-router is written to provide more capable static router and especially
allow serving mini-modules.

Also all routing definitions return a promise that allows better control over
status when routes are added fully and when router is ready.

```javascript
var connect = require("connect");
var http = require("http");

var Promise = require("mini-promise-aplus").Promise;
var Router = require("mini-router").Router;

var router = new Router("TestRouter");

Promise.all([
    router.static("/modules/mini-promise.js", require.resolve("mini-promise-aplus")),
    router.static("/public/", __dirname + "/static/"),
    router.get("/hello", function (req, res) {
        res.end("Hello!\n");
    }),
    router.get("/hello/:name", function (req, res) {
        res.end("Hello: " + req.params.name + "!\n");
    }),
    router.post("/echo", function (req, res) {
        var data = "";
        req.on("data", function(chunk) {
            data += chunk;
        });
        req.on("end", function() {
            res.end(data);
        });
    }),
    router.get("/routes", function (req, res) {
        res.end(router.routes);
    })
]).then(function () {
    console.log("Listening requests in port 3000.");
    var app = connect();
    app.use(connect.logger());
    app.use(router.connect());
    http.createServer(app).listen(3000);
}).catch(function (reason) {
    console.error("Failed to start server: ", reason);
    if (reason.stack) console.error(reason.stack);
});

```
