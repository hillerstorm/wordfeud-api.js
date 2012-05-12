var http = require('http'),
    crypto = require('crypto'),
    boards = {},
    rulesets = {};

function getHashedPassword (password) {
    var shasum = crypto.createHash('sha1');
    shasum.update(password + 'JarJarBinks9', 'utf8');
    return shasum.digest('hex');
}

function defaultOptions (path, contentLength, sessionid) {
    var options = {
        host: 'game02.wordfeud.com',
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'User-Agent': 'WebFeudClient/2.0.3 (iOS; 5.0.1; iPhone4S)',
            'Content-Type': 'application/json',
            'Content-Length': contentLength.toString()
        }
    };
    if (path) {
        options.path = '/wf/' + path;
    }
    if (sessionid) {
        options.headers['Cookie'] = 'sessionid=' + sessionid;
    }

    return options;
}

function request (options, content, onComplete) {
    var data = '',
        request = http.request(options, function (response) {
            if (!onComplete) {
                return;
            }

            if (response.statusCode !== 200) {
                onComplete('got statuscode ' + response.statusCode);
                return;
            }

            response.setEncoding('utf8');
            data = '';
            response.on('data', function (chunk) {
                data += chunk;
            });
            response.on('end', function () {
                onComplete(null, response, data);
            });
        }).on('error', function (err) {
            if (onComplete) {
                onComplete(err);
            }
        });

    if (content) {
        request.write(content);
    }
    request.end();
}

function execute (path, content, sessionId, onComplete) {
    var contentLength, utf8Matches,
        options, result;

    if (!path) {
        throw 'You must specify a path';
    }

    if (typeof content === 'object') {
        content = JSON.stringify(content);
    }

    contentLength = 0;
    if (content) {
        utf8Matches = encodeURIComponent(content).match(/%[89ABab]/g);
        contentLength = content.length + (utf8Matches ? utf8Matches.length : 0);
    }

    options = defaultOptions(path, contentLength, sessionId);

    request(options, content, function (err, response, data) {
        if (!onComplete) {
            return;
        }

        if (err) {
            onComplete(err);
            return;
        }

        try {
            result = JSON.parse(data);
            if (result.status) {
                if (result.status === 'success') {
                    onComplete(null, response, result);
                } else if (result.status === 'error') {
                    onComplete('Error: ' + result.content.type);
                } else {
                    onComplete('No success when logging in: ' + JSON.stringify(result));
                }
            } else {
                onComplete('Invalid response when logging in: ' + JSON.stringify(result));
            }
        } catch (e) {
            onComplete(e);
        }
    });
}

function simpleGet (path, content, sessionId, propertyPath, onComplete) {
    if (!onComplete) {
        return;
    }

    execute(path, content, sessionId, function (err, response, result) {
        if (err) {
            onComplete(err);
            return;
        }

        onComplete(null, result.content[propertyPath]);
    });
}

function cachingGet (path, content, sessionId, propertyPath, cache, id, onComplete) {
    if (!onComplete) {
        return;
    }

    if (cache[id]) {
        process.nextTick(function () {
            onComplete(null, cache[id]);
        });
        return;
    }

    simpleGet(path, content, sessionId, propertyPath, function (err, entity) {
        if (err) {
            onComplete(err);
            return;
        }

        cache[id] = entity;

        onComplete(null, entity);
    });
}

function extractSessionId (response) {
    var sessionId = '';

    response.headers['set-cookie'] && response.headers['set-cookie'][0].split(';').forEach(function (cookie) {
        var parts = cookie.split('=');
        if (parts[0].trim() === 'sessionid') {
            sessionId = (parts[1] || '').trim();
        }
    });

    return sessionId;
}

function isEmail (str) {
    return str.match(/^(?:[\w\!\#\$\%\&\'\*\+\-\/\=\?\^\`\{\|\}\~]+\.)*[\w\!\#\$\%\&\'\*\+\-\/\=\?\^\`\{\|\}\~]+@(?:(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-](?!\.)){0,61}[a-zA-Z0-9]?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9\-](?!$)){0,61}[a-zA-Z0-9]?)|(?:\[(?:(?:[01]?\d{1,2}|2[0-4]\d|25[0-5])\.){3}(?:[01]?\d{1,2}|2[0-4]\d|25[0-5])\]))$/);
}

function loginWithId (id, password, sessionId, onComplete) {
    var content;

    if (!onComplete) {
        return;
    }

    if (!id) {
        process.nextTick(function () {
            onComplete('No id given');
        });
        return;
    }
    if (!password) {
        process.nextTick(function () {
            onComplete('No password given');
        });
        return;
    }

    content = {
        id: id,
        password: getHashedPassword(password)
    };

    execute('user/login/id/', content, sessionId, function (err, response, result) {
        if (err) {
            onComplete(err);
            return;
        }

        onComplete(null, {
            sessionId: extractSessionId(response),
            user: {
                id: result.content.id,
                username: result.content.username,
                email: result.content.email
            }
        });
    });
}

function getGame (gameId, sessionId, onComplete) {
    simpleGet('game/' + gameId + '/', null, sessionId, 'game', onComplete);
}

module.exports = {
    getGames: function (sessionId, onComplete) {
        simpleGet('user/games/', null, sessionId, 'games', onComplete);
    },
    getRelationships: function (sessionId, onComplete) {
        simpleGet('user/relationships/', null, sessionId, 'relationships', onComplete);
    },
    getChat: function (gameId, sessionId, onComplete) {
        simpleGet('game/' + gameId + '/chat/', null, sessionId, 'messages', onComplete);
    },
    getGame: getGame,
    getRuleset: function (rulesetId, sessionId, onComplete) {
        cachingGet('tile_points/' + rulesetId + '/', null, sessionId, 'tile_points', rulesets, rulesetId, onComplete);
    },
    getBoard: function (boardId, sessionId, onComplete) {
        cachingGet('board/' + boardId + '/', null, sessionId, 'board', boards, boardId, onComplete);
    },
    getNotifications: function (sessionId, onComplete) {
        simpleGet('user/notifications/', null, sessionId, 'entries', onComplete);
    },
    move: function (gameId, rulesetId, move, words, socketId) {
        var content = {
            move: move,
            ruleset: rulesetId,
            words: words
        };
        execute('game/' + gameId + '/move/', content, sessionId, function (err, res, result) {
            if (!onComplete) {
                return;
            }

            if (err) {
                onComplete(err);
                return;
            }

            getGame(gameId, sessionId, function (err, game) {
                if (err) {
                    onComplete(err);
                    return;
                }

                onComplete(null, {
                    newTiles: result.content.new_tiles,
                    points: result.content.points,
                    mainWord: result.content.main_word,
                    game: game
                });
            });
        });
    },
    pass: function (gameId, sessionId, onComplete) {
        execute('game/' + gameId + '/pass/', null, sessionId, function (err, response, result) {
            if (!onComplete) {
                return;
            }            

            if (err) {
                onComplete(err);
                return;
            }

            getGame(socket, gameId, function (err, game) {
                if (err) {
                    onComplete(err);
                    return;
                }

                onComplete(null, game);
            });
        });
    },
    resign: function (gameId, sessionId, onComplete) {
        execute('game/' + gameId + '/resign/', null, sessionId, function (err, response, result) {
            if (!onComplete) {
                return;
            }

            if (err) {
                onComplete(err);
                return;
            }

            getGame(gameId, sessionId, function (err, game) {
                if (err) {
                    onComplete(err);
                    return;
                }

                onComplete(null, game);
            });
        });
    },
    chat: function (gameId, message, sessionId, onComplete) {
        simpleGet('game/' + gameId + '/chat/send/', { message: message }, sessionId, 'sent', onComplete);
    },
    loginWithId: loginWithId,
    login: function (user, password, onComplete) {
        var content, ext;

        if (!onComplete) {
            return;
        }

        if (!user) {
            process.nextTick(function () {
                onComplete('No username/email given');
            });
            return;
        }
        if (!password) {
            process.nextTick(function () {
                onComplete('No password given');
            });
            return;
        }

        content = {
            password: getHashedPassword(password)
        };

        ext = '';
        if (isEmail(user)) {
            ext = 'email/';
            content.email = user;
        } else {
            content.username = user;
        }

        execute('user/login/' + ext, content, sessionId, function (err, response, result) {
            if (err) {
                onComplete(err);
                return;
            }

            loginWithId(result.content.id, password, sessionId, onComplete);
        });
    }
};