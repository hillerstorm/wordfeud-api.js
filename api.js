'use strict';

import http from 'http';
import crypto from 'crypto';

export default class Api {
    constructor() {
        this.init();
    }

    init (boards = {}, rulesets = {}) {
        this.boards = boards;
        this.rulesets = rulesets;
    }

    isEmail (str) {
        return str.match(/^(?:[\w\!\#\$\%\&\'\*\+\-\/\=\?\^\`\{\|\}\~]+\.)*[\w\!\#\$\%\&\'\*\+\-\/\=\?\^\`\{\|\}\~]+@(?:(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-](?!\.)){0,61}[a-zA-Z0-9]?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9\-](?!$)){0,61}[a-zA-Z0-9]?)|(?:\[(?:(?:[01]?\d{1,2}|2[0-4]\d|25[0-5])\.){3}(?:[01]?\d{1,2}|2[0-4]\d|25[0-5])\]))$/);
    }

    _extractSessionId (response) {
        let sessionId = '';

        if (response.headers['set-cookie']) {
            response.headers['set-cookie'][0].split(';').forEach(cookie => {
                var parts = cookie.split('=');
                if (parts[0].trim() === 'sessionid') {
                    sessionId = (parts[1] || '').trim();
                }
            });
        }

        return sessionId;
    }

    _getHashedPassword (password) {
        const shasum = crypto.createHash('sha1');
        shasum.update(password + 'JarJarBinks9', 'utf8');
        return shasum.digest('hex');
    }

    defaultOptions (path, contentLength, sessionid) {
        let options = {
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
            options.headers.Cookie = 'sessionid=' + sessionid;
        }

        return options;
    }

    _request (options, content, onComplete) {
        const request = http.request(options, response => {
            if (!onComplete) {
                return;
            }

            if (response.statusCode !== 200) {
                onComplete(new Error('got statuscode ' + response.statusCode));
                return;
            }

            response.setEncoding('utf8');
            let data = '';
            response.on('data', chunk => {
                data += chunk;
            });
            response.on('end', () => {
                onComplete(null, response, data);
            });
        }).on('error', err => {
            if (onComplete) {
                onComplete(err);
            }
        });

        if (content) {
            request.write(content);
        }
        request.end();
    }

    _execute (path, content, sessionId, onComplete) {
        if (!path) {
            throw new Error('You must specify a path');
        }

        if (typeof content === 'object') {
            content = JSON.stringify(content);
        }

        let contentLength = 0;
        if (content) {
            let utf8Matches = encodeURIComponent(content).match(/%[89ABab]/g);
            contentLength = content.length + (utf8Matches ? utf8Matches.length : 0);
        }

        const options = this.defaultOptions(path, contentLength, sessionId);

        this._request(options, content, (err, response, data) => {
            if (!onComplete) {
                return;
            }

            if (err) {
                onComplete(err);
                return;
            }

            try {
                const result = JSON.parse(data);
                if (result.status) {
                    if (result.status === 'success') {
                        onComplete(null, response, result);
                    } else if (result.status === 'error') {
                        onComplete(new Error('Error: ' + result.content.type));
                    } else {
                        onComplete(new Error('No success when logging in: ' + JSON.stringify(result)));
                    }
                } else {
                    onComplete(new Error('Invalid response when logging in: ' + JSON.stringify(result)));
                }
            } catch (e) {
                onComplete(e);
            }
        });
    }

    _simpleGet (path, content, sessionId, propertyPath, onComplete) {
        if (!onComplete) {
            return;
        }

        this._execute(path, content, sessionId, (err, response, result) => {
            if (err) {
                onComplete(err);
                return;
            }

            let obj;
            if (propertyPath) {
                obj = result.content[propertyPath];
            } else {
                obj = result.content;
            }
            onComplete(null, obj);
        });
    }

    _cachingGet (path, content, sessionId, propertyPath, cache, id, onComplete) {
        if (!onComplete) {
            return;
        }

        if (cache[id]) {
            process.nextTick(() => {
                onComplete(null, cache[id]);
            });
            return;
        }

        this._simpleGet(path, content, sessionId, propertyPath, (err, entity) => {
            if (err) {
                onComplete(err);
                return;
            }

            cache[id] = entity;

            onComplete(null, entity);
        });
    }

    getGames (sessionId, onComplete) {
        this._simpleGet('user/games/', null, sessionId, 'games', onComplete);
    }

    getRelationships (sessionId, onComplete) {
        this._simpleGet('user/relationships/', null, sessionId, 'relationships', onComplete);
    }

    getChat (gameId, sessionId, onComplete) {
        this._simpleGet('game/' + gameId + '/chat/', null, sessionId, 'messages', onComplete);
    }

    getGame (gameId, sessionId, onComplete) {
        this._simpleGet('game/' + gameId + '/', null, sessionId, 'game', onComplete);
    }

    getRuleset (rulesetId, sessionId, onComplete) {
        this._cachingGet('tile_points/' + rulesetId + '/', null, sessionId, 'tile_points', this.rulesets, rulesetId, onComplete);
    }

    getBoard (boardId, sessionId, onComplete) {
        this._cachingGet('board/' + boardId + '/', null, sessionId, 'board', this.boards, boardId, onComplete);
    }

    getNotifications (sessionId, onComplete) {
        this._simpleGet('user/notifications/', null, sessionId, 'entries', onComplete);
    }

    getStatus (sessionId, onComplete) {
        this._simpleGet('user/status/', null, sessionId, null, onComplete);
    }

    move (gameId, rulesetId, move, words, sessionId, onComplete) {
        const content = {
            move: move,
            ruleset: rulesetId,
            words: words
        };
        this._execute('game/' + gameId + '/move/', content, sessionId, (err, res, result) => {
            if (!onComplete) {
                return;
            }

            if (err) {
                onComplete(err);
                return;
            }

            this.getGame(gameId, sessionId, (er, game) => {
                if (er) {
                    onComplete(er);
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
    }

    swap (gameId, tiles, sessionId, onComplete) {
        this._execute('game/' + gameId + '/swap/', { tiles: tiles }, sessionId, null, (err, content) => {
            if (!onComplete) {
                return;
            }

            if (err) {
                onComplete(err);
                return;
            }

            this.getGame(gameId, sessionId, (er, game) => {
                if (er) {
                    onComplete(er);
                    return;
                }

                onComplete(null, {
                    updated: content.updated,
                    newTiles: content.new_tiles,
                    game: game
                });
            });
        });
    }

    pass (gameId, sessionId, onComplete) {
        this._execute('game/' + gameId + '/pass/', null, sessionId, (err) => {
            if (!onComplete) {
                return;
            }

            if (err) {
                onComplete(err);
                return;
            }

            this.getGame(gameId, sessionId, (er, game) => {
                if (er) {
                    onComplete(er);
                    return;
                }

                onComplete(null, game);
            });
        });
    }

    resign (gameId, sessionId, onComplete) {
        this._execute('game/' + gameId + '/resign/', null, sessionId, (err) => {
            if (!onComplete) {
                return;
            }

            if (err) {
                onComplete(err);
                return;
            }

            this.getGame(gameId, sessionId, (er, game) => {
                if (er) {
                    onComplete(er);
                    return;
                }

                onComplete(null, game);
            });
        });
    }

    chat (gameId, message, sessionId, onComplete) {
        this._simpleGet('game/' + gameId + '/chat/send/', { message: message }, sessionId, 'sent', onComplete);
    }

    inviteUser (user, rulesetId, boardType, sessionId, onComplete) {
        const content = {
            invitee: user,
            ruleset: rulesetId,
            'board_type': boardType
        };
        this._simpleGet('invite/new/', content, sessionId, 'invitation', onComplete);
    }

    inviteRandom (rulesetId, boardType, sessionId, onComplete) {
        const content = {
            ruleset: rulesetId,
            'board_type': boardType
        };
        this._simpleGet('random_request/create/', content, sessionId, 'request', onComplete);
    }

    acceptInvite (inviteId, sessionId, onComplete) {
        this._simpleGet('invite/' + inviteId + '/accept/', null, sessionId, 'id', onComplete);
    }

    rejectInvite (inviteId, sessionId, onComplete) {
        this._simpleGet('invite/' + inviteId + '/reject/', null, sessionId, null, (err) => {
            if (err) {
                onComplete(err);
                return;
            }
            onComplete(null);
        });
    }

    loginWithId (id, password, sessionId, onComplete) {
        if (!onComplete) {
            return;
        }

        if (!id) {
            process.nextTick(() => {
                onComplete(new Error('No id given'));
            });
            return;
        }
        if (!password) {
            process.nextTick(() => {
                onComplete(new Error('No password given'));
            });
            return;
        }

        const content = {
            id: id,
            password: this._getHashedPassword(password)
        };

        this._execute('user/login/id/', content, sessionId, (err, response, result) => {
            if (err) {
                onComplete(err);
                return;
            }

            onComplete(null, {
                sessionId: sessionId || this._extractSessionId(response),
                user: {
                    id: result.content.id,
                    username: result.content.username,
                    email: result.content.email
                }
            });
        });
    }

    login (user, password, onComplete) {
        if (!onComplete) {
            return;
        }

        if (!user) {
            process.nextTick(() => {
                onComplete(new Error('No username/email given'));
            });
            return;
        }
        if (!password) {
            process.nextTick(() => {
                onComplete(new Error('No password given'));
            });
            return;
        }

        const content = {
            password: this._getHashedPassword(password)
        };

        let ext = '';
        if (this.isEmail(user)) {
            ext = 'email/';
            content.email = user;
        } else {
            content.username = user;
        }

        this._execute('user/login/' + ext, content, null, (err, response, result) => {
            if (err) {
                onComplete(err);
                return;
            }

            this.loginWithId(result.content.id, password, this._extractSessionId(response), onComplete);
        });
    }
}
