var connect = require("connect");
var http = require("http");

var Promise = require("mini-promise").Promise;
var Router = require("../router.js").Router;

var router = new Router("test");

Promise.all([
    router.static("/modules/mini-promise.js", require.resolve("mini-promise")),
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

