//const Twit = require('twit')
//const readline = require('readline');
const PORT = process.env.OPENSHIFT_NODEJS_PORT || 8443;
var server = require('https').createServer();
var io = require('socket.io')(server);
io.on('connection', function (socket) {
    console.log("a user connected");

    socket.on('disconnect', function (e) {
        console.log("disconnect");
    });
    socket.on('chat message', function (o) {
        socket.broadcast.emit("chat message", o);
    });
});
server.listen(PORT, function () {
    console.log('>app is running on port ' + PORT);
})



