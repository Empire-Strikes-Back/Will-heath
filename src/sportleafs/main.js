const http = require('http'),
    https = require('http'),
    fs = require('fs'),
    path = require('path'),
    contentTypes = require('./utils/content-types'),
    sysInfo = require('./utils/sys-info'),
    env = process.env,
    Twit = require('twit')
    ;
let timeoutId = 0;

const THEMES = {
    "nba": ["nba"],
    "football": ["la liga", "premierleague", "bundesliga", "mourinho", "wenger", "guardiola"],
    "nhl": ["nhl"],
    "nfl": ["nfl"],
    "olympics": ["olympic"],
    "tennis": ["federer", "nadal", "djokovic", "atp", "us open"]
}

var tweets = {};

function storeTweet(tweet) {
    const promises = [];
    var text = tweet.text;
    //in case we decide to break or return
    for (var p in THEMES) {
        promises.push(new Promise((y, f) => {
            let quote = tweet.quoted_status ? tweet.quoted_status.text : "";
            let hashtags = tweet.entities.hashtags.reduce((p, c, i, a) => { return [p, c.text].join(" #") }, "")
            if (new RegExp(THEMES[p].join('|'), 'gi').test([text, hashtags, quote].join(''))) {
                y(p);
            }
            y(false)
        }))
    }
    return Promise.all(promises).then((vs) => {
        return [tweet, vs.filter((v) => { return v ? true : false; })];
    }).then(([tweet, values]) => {
        values.forEach((value, i, a) => {
            if (value) {
                tweets[value] = tweets[value] || [];
                tweets[value].push(tweet);
                tweets[value].splice(0, tweets[value].length - 50);
            }
        })
        return values;
    });
}


let server = http.createServer(function (req, res) {

    //res.writeHead(200);
    //res.setHeader('Access-Control-Allow-Origin', '*');
    //res.end();
    let url = req.url;
    if (url == '/') {
        url += 'index.html';
    }

    // IMPORTANT: Your application HAS to respond to GET /health with status 200
    //            for OpenShift health monitoring
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (url == '/health') {
        res.writeHead(200);
        res.end();
    } else if (url == '/info/gen' || url == '/info/poll') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-cache, no-store');
        res.end(JSON.stringify(sysInfo[url.slice(6)]()));
    } else {
        fs.readFile('./static' + url, function (err, data) {
            if (err) {
                res.writeHead(404);
                res.end('Not found');
            } else {
                let ext = path.extname(url).slice(1);
                res.setHeader('Content-Type', contentTypes[ext]);
                if (ext === 'html') {
                    res.setHeader('Cache-Control', 'no-cache, no-store');
                }
                res.end(data);
            }
        });
    }
});
var io = require('socket.io')(server);

var T = new Twit({
    consumer_key: 'PDvvNuj9QpgrwuMmXj5BzcD6D',
    consumer_secret: 'ioU0pUy9apMMs80Wb2NXw793POAsf3XkOZ9C5OaEjBdvEnwpOe',
    access_token: '757606965895987201-GiPClOgfqmnpFji4TnJfDAyb5CSSuSG',
    access_token_secret: 'gb5lJfcb13bRU2KvXX0XZUwi9x8CUQmru0ED0l8nsCale',
    //app_only_auth: true
})
// T = new Twit({
//     consumer_key: 'YS2BntFcYVkTdf2kju0sVWIFy',
//     consumer_secret: '9gw8ACgOGKO5NMEaqi7zp3QV0ATG7Hnx8aVYaGkAVLPwiTELLR',
//     access_token: '	757606965895987201-dxD7Y2pDfLryYTD2zRzBP6qVx2l3xn2',
//     access_token_secret: 'N38Bzi6csid84B9EBJLGMFl0E1sPNKhmG1nZBKhG9GFO2',
//     //  app_only_auth: true
// })

//match({ text: "here is nba nFL" }).then((vs) => { console.log(tweets);console.log(vs) });

const streamParams = {
    track: Object.keys(THEMES).map((e) => THEMES[e].join(',')).join(','),
    language: 'en',
    // filter_level: 'medium'
}

var stream = T.stream('statuses/filter', streamParams)
stream.isStopped = false;
io.on('connection', function (socket) {
    console.log(`${socket.id} connected`);

    clearTimeout(timeoutId);
    if (stream.isStopped) {
        console.log("stream has been restarted");
        stream.start();
    }

    socket.on('disconnect', function (e) {
        console.log(`${socket.id} disconnected`);

        if (!Object.keys(io.sockets.connected).length) {
            timeoutId = setTimeout(() => {
                stream.stop();
                stream.isStopped = true;
                Object.keys(tweets).forEach(function (e) {
                    tweets[e].splice(0);
                })
                console.log("stream has been stopped");
            }, 3600 * 1000);
        }

    });
    socket.on('message', function (o) {
        io.emit("message", { id: socket.id, data: o });
    });
    //io.emit("message", { id: "server", msg: `new user connected ${socket.id}` });
    socket.on('themes', function (themes, callback) {
        // io.sockets.connected[socket.id].rooms.forEach((e,i,a)=>{
        //   socket.leave(e);
        // })
        Object.keys(socket.rooms).forEach((e, i, a) => {
            let room = socket.rooms[e];
            if (room != socket.id) {
                socket.leave(room);
            }
        })
        const sports = [];
        themes.forEach((e, i, a) => {
            if (THEMES[e]) {
                socket.join(e.toLowerCase());
                sports.push(e.toLowerCase());
            }
        })
        //console.log(`socket rooms ${Object.keys(socket.rooms).join('-')}`);
        console.log(`${socket.id} changed sports to ${sports.join(',')} --`);
        if (callback) {
            callback(themes.reduce((p, c, i, a) => {
                if (!p[c]) {
                    p[c] = tweets[c] ? tweets[c].slice(-15) : [];
                }
                return p;
            }, {}));
        }

    });
});



stream.on('message', function (msg) {
})

stream.on('connect', function (request) {

    console.log("stream 'connect' event");
})
stream.on('reconnect', function (request, response, connectInterval) {

    console.log("reconnect attempt");

})

stream.on('tweet', function (tweet) {
    if (tweet.user && tweet.user.followers_count > 5000) {
        let p = storeTweet(tweet).then((matches) => {
            // fs.appendFile("tweets.json", JSON.stringify(matches));
            // fs.appendFile("tweets.json", JSON.stringify(tweet));
            // console.log(tweet.text);
            // console.log(matches);
            // Object.keys(tweets).forEach((e, i, a) => {
            //   console.log(`${e}: ${tweets[e].length}`);
            // })
            matches.forEach((e, i, a) => {
                io.to(e).emit('tweet', Object.assign({ themes: matches }, tweet));
            })
        })

    }
    io.of('tweet').emit('tweet', tweet)
})

stream.on('disconnect', function (disconnectMessage) {
    console.log("twitter stream disconnected")
    stream.isStopped = true;
})

stream.on('error', function (err) {
    console.log("twitter stream error:")
    console.log(err);
    stream.isStopped = true;
})

const PORT = process.env.OPENSHIFT_NODEJS_PORT || 2000;

console.log(`port: ${PORT}`);
console.log(`ip: ${env.OPENSHIFT_NODEJS_IP || 'localhost'}`);

server.listen(PORT, env.OPENSHIFT_NODEJS_IP || 'localhost', function () {
    console.log(`Application worker ${process.pid} started...`);
});





// const Twit = require('twit')
// const readline = require('readline');
// const net = require('net');
// const WebSocketServer = require('ws').Server
// var r = null;
// const connected = [];
// // const server = new WebSocketServer({ port: 2000 });
// // server.on('connection', function (socket) {
// //     connected.push(socket);
// //     socket.on('message', function (message) {
// //         console.log(message);
// //     });
// //     socket.send(JSON.stringify({ hello: "hello" }));
// //     console.log('->connected')
// // });
// // server.on('disconnect', function (socket) {
// //     connected.splice(connected.indexOf(socket),1);
// //     console.log("->disconnected");
// // });


// // var express = require('express');
// // var port = 2000;
// // var app = express();

// // var http = require('http').Server(app);
// // var path = require('path');
// // var io = require('socket.io')(http);
// // var options = {
// //   key: fs.readFileSync('./file.pem'),
// //   cert: fs.readFileSync('./file.crt')
// // };
// // var serverPort = 443;


// const pem = require('pem');
// var fs = require('fs');
// //var app = require('express')();
// var io;
// const PORT = 2443;
// var T;
// var stream;
// // pem.createCertificate({ days: 1, selfSigned: true }, function (err, keys) {
// //     //console.log(Object.keys(keys));
// //     //fs.writeFile('certs.json', JSON.stringify(keys));
// //     //keys = fs.readFileSync('certs.json');
// //     var server = require('https').createServer({ host: 'localhost', key: keys.serviceKey, cert: keys.certificate });
// //     io = require('socket.io')(server);
// //     io.on('connection', function (socket) {
// //         console.log("a user connected");

// //         socket.on('disconnect', function (e) {
// //             console.log("disconnect");
// //         });
// //         socket.on('chat message', function (o) {
// //             socket.broadcast.emit("chat message", o);
// //         });
// //     });
// //     server.listen(PORT, function () {
// //         console.log('>app is running on port ' + PORT + '\n>type   http://127.0.0.1:' + PORT + '   in your browser to use the application\n>to stop the server: press  ctrl + c');
// //     })

// // });

// function say(...args) {
//     console.log(args);
// }

// // var server = require('http').createServer();
// // io = require('socket.io')(server);
// // io.on('connection', function (socket) {
// //     console.log("a user connected");

// //     socket.on('disconnect', function (e) {
// //         console.log("disconnect");
// //     });
// //     socket.on('chat message', function (o) {
// //         socket.broadcast.emit("chat message", o);
// //     });
// // });
// // server.listen(PORT, function () {
// //     console.log('>app is running on port ' + PORT + '\n>type   http://127.0.0.1:' + PORT + '   in your browser to use the application\n>to stop the server: press  ctrl + c');
// // })
// T = new Twit({
//     consumer_key: 'PDvvNuj9QpgrwuMmXj5BzcD6D',
//     consumer_secret: 'ioU0pUy9apMMs80Wb2NXw793POAsf3XkOZ9C5OaEjBdvEnwpOe',
//     access_token: '757606965895987201-GiPClOgfqmnpFji4TnJfDAyb5CSSuSG',
//     access_token_secret: 'gb5lJfcb13bRU2KvXX0XZUwi9x8CUQmru0ED0l8nsCale',
//     //  app_only_auth: true
// })
// // T = new Twit({
// //     consumer_key: 'YS2BntFcYVkTdf2kju0sVWIFy',
// //     consumer_secret: '9gw8ACgOGKO5NMEaqi7zp3QV0ATG7Hnx8aVYaGkAVLPwiTELLR',
// //     access_token: '	757606965895987201-dxD7Y2pDfLryYTD2zRzBP6qVx2l3xn2',
// //     access_token_secret: 'N38Bzi6csid84B9EBJLGMFl0E1sPNKhmG1nZBKhG9GFO2',
// //     //  app_only_auth: true
// // })
// stream = T.stream('statuses/filter', { track: ["nba"], language: 'en' })
// stream.on('connect', function (res) {
//     fs.writeFile('connect.json', JSON.stringify(res));
//     console.log("connect");
// })

// stream.on('reconnect', function () {
//     fs.writeFile('reconnect.json', JSON.stringify(arguments));
// })
// stream.on('tweet', function (tweet) {
//     fs.writeFile('tweet.json', JSON.stringify(arguments));
//     console.log("tweet")
// })
// // stream = T.stream('statuses/filter', { track: ["nba"], language: 'en' })
// // stream.on('message', function (msg) {
// // })

// // stream.on('connect', function (request) {
// //     console.log("attempt to connect");
// //     io.emit('msg', "stream connecting")
// // })

// // stream.on('tweet', function (tweet) {
// //     console.log('tweet');
// //     if (tweet.user && tweet.user.followers_count > 10000) {
// //         io.emit('msg', tweet);
// //     }
// // })

// // stream.on('disconnect', function (disconnectMessage) {
// //     say("disconnect")
// // })
// // var https = require('https'),
// //     pem = require('pem'),
// //     express = require('express');

// // pem.createCertificate({days:1, selfSigned:true}, function(err, keys){
// //   var app = express();

// //   app.get('/',   function(req, res){
// //     res.send('o hai!');
// //   });

// //   https.createServer({key: keys.serviceKey, cert: keys.certificate}, app).listen(443);
// // });

// // var T = new Twit({
// //     consumer_key: '...',
// //     consumer_secret: '...',
// //     access_token: '...',
// //     access_token_secret: '...',
// //     timeout_ms: 60 * 1000,  // optional HTTP request timeout to apply to all requests.
// // })



// // T.post('statuses/update', { status: 'test' }, function(err, data, response) {
// //   console.log(data)
// // })

// //var stream = T.stream('statuses/filter', { locations: sanFrancisco })
// //var stream = T.stream('statuses/filter', { track: '#apple', language: 'en' })
// //var stream = T.stream('statuses/filter', { track: ['bananas', 'oranges', 'strawberries'] })

// // var sanFrancisco = [ '-122.75', '36.8', '-121.75', '37.8' ]

// // var stream = T.stream('statuses/filter', { locations: sanFrancisco })

// //var stream = T.stream('statuses/sample')





// // const server = net.createServer((socket) => {
// //     connected.push(socket);
// //     socket.write("hi there");
// //     console.log(`-> new socket: ${socket.remoteAddress}`);
// // }).on('error', (err) => {
// //     console.log(err);
// // });


// // server.listen({
// //     host: 'localhost',
// //     port: 2000,
// //     exclusive:true
// // },() => {
// //     address = server.address();
// //     console.log('opened server on %j', address);
// // })


// //roomManager.create(3,4);



