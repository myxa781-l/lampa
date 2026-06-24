(function () {
    'use strict';

    if (window.uafix_plugin_loaded) return;
    window.uafix_plugin_loaded = true;

    var UAFIX = 'https://uafix.net';
    var ZET   = 'https://zetvideo.net';
    var PLUGIN_NAME = 'uafix_online';

    function parseHTML(text) {
        return (new DOMParser()).parseFromString(text, 'text/html');
    }

    function getRequest(url, success, error) {
        var net = new Lampa.Reguest();
        net.silent(url, function (data) {
            if (typeof data === 'string') {
                success(data);
            } else {
                try { success(JSON.stringify(data)); }
                catch(e) { success(''); }
            }
        }, function (e) {
            if (error) error(e);
        }, false, {
            dataType: 'text'
        });
        return net;
    }

    function escapeHtml(t) {
        return t ? String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : '';
    }

    // ============ SEARCH COMPONENT ============

    function uafixComponent(object) {
        var network = new Lampa.Reguest();
        var scroll  = new Lampa.Scroll({ mask: true, over: true });
        var files   = new Lampa.Explorer(object);
        var last    = false;
        var initialized = false;

        this.create = function () {
            return this.render();
        };

        this.start = function () {
            var _this = this;

            if (Lampa.Activity.active().activity !== this.activity) return;

            Lampa.Background.immediately(Lampa.Utils.cardImgBackgroundBlur(object.movie));

            if (!initialized) {
                initialized = true;
                files.appendFiles(scroll.render());
                scroll.body().addClass('torrent-list');
                _this.doSearch();
            }

            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render(), files.render());
                    Lampa.Controller.collectionFocus(last || false, scroll.render());
                },
                up: function () {
                    if (Navigator.canmove('up')) Navigator.move('up');
                    else Lampa.Controller.toggle('head');
                },
                down: function () { Navigator.move('down'); },
                right: function () { Navigator.move('right'); },
                left: function () {
                    if (Navigator.canmove('left')) Navigator.move('left');
                    else Lampa.Controller.toggle('menu');
                },
                back: this.back
            });
            Lampa.Controller.toggle('content');
        };

        this.doSearch = function () {
            var _this = this;
            var query = object.search || object.movie.title || object.movie.name || '';

            if (!query) { _this.showEmpty(); return; }

            _this.activity.loader(true);

            var url = UAFIX + '/index.php?do=search&subaction=search&story=' + encodeURIComponent(query);

            getRequest(url, function (text) {
                var doc = parseHTML(text);
                var results = [];
                var seen = {};

                doc.querySelectorAll('a[href]').forEach(function (a) {
                    var href = a.getAttribute('href') || '';
                    if (!href.includes('/serials/') && !href.includes('/films/')) return;
                    if (href === UAFIX + '/serials/' || href === UAFIX + '/films/') return;
                    if (href.endsWith('/serials/') || href.endsWith('/films/')) return;
                    if (seen[href]) return;

                    var title = a.textContent.trim();
                    if (!title || title.length < 3) return;

                    seen[href] = true;
                    results.push({
                        title: title,
                        url: href.startsWith('http') ? href : UAFIX + href
                    });
                });

                _this.activity.loader(false);
                _this.activity.toggle();

                if (!results.length) {
                    _this.showEmpty();
                    return;
                }

                _this.drawResults(results);

            }, function () {
                _this.activity.loader(false);
                _this.showEmpty();
            });
        };

        this.drawResults = function (results) {
            var _this = this;

            results.forEach(function (r) {
                var item = $('<div class="selector" style="padding:0.5em 0">' +
                    '<div style="padding:0.7em 1em;background:rgba(255,255,255,0.06);border-radius:0.3em">' +
                    '<div style="font-size:1.3em;color:white">' + escapeHtml(r.title) + '</div>' +
                    '</div></div>');

                item.on('hover:enter', function () {
                    Lampa.Activity.push({
                        url: '',
                        title: 'UAFlix',
                        component: 'uafix_page',
                        page_url: r.url,
                        page_title: r.title,
                        movie: object.movie
                    });
                }).on('hover:focus', function (e) {
                    last = e.target;
                    scroll.update($(e.target), true);
                });

                scroll.append(item);
            });

            Lampa.Controller.enable('content');
        };

        this.showEmpty = function () {
            this.activity.loader(false);
            this.activity.toggle();
            scroll.append($('<div style="padding:2em;text-align:center;font-size:1.4em;opacity:0.6">Нічого не знайдено</div>'));
            Lampa.Controller.enable('content');
        };

        this.render  = function () { return files.render(); };
        this.back    = function () { Lampa.Activity.backward(); };
        this.pause   = function () {};
        this.stop    = function () { network.clear(); };
        this.destroy = function () { network.clear(); scroll.destroy(); files.destroy(); };
    }

    // ============ PAGE COMPONENT ============

    function uafixPageComponent(object) {
        var network = new Lampa.Reguest();
        var scroll  = new Lampa.Scroll({ mask: true, over: true });
        var files   = new Lampa.Explorer(object);
        var last    = false;
        var initialized = false;

        this.create = function () {
            return this.render();
        };

        this.start = function () {
            var _this = this;

            if (Lampa.Activity.active().activity !== this.activity) return;

            Lampa.Background.immediately(Lampa.Utils.cardImgBackgroundBlur(object.movie));

            if (!initialized) {
                initialized = true;
                files.appendFiles(scroll.render());
                scroll.body().addClass('torrent-list');
                _this.loadPage();
            }

            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render(), files.render());
                    Lampa.Controller.collectionFocus(last || false, scroll.render());
                },
                up: function () {
                    if (Navigator.canmove('up')) Navigator.move('up');
                    else Lampa.Controller.toggle('head');
                },
                down: function () { Navigator.move('down'); },
                right: function () { Navigator.move('right'); },
                left: function () {
                    if (Navigator.canmove('left')) Navigator.move('left');
                    else Lampa.Controller.toggle('menu');
                },
                back: this.back
            });
            Lampa.Controller.toggle('content');
        };

        this.loadPage = function () {
            var _this = this;
            var url = object.page_url;

            if (!url) { _this.showEmpty(); return; }

            _this.activity.loader(true);

            getRequest(url, function (text) {
                var doc = parseHTML(text);

                // 1) Серии
                var episodes = _this.parseEpisodes(doc);
                if (episodes.length) {
                    _this.showItems(episodes, 'episode');
                    return;
                }

                // 2) Сезоны
                var seasons = _this.parseSeasons(doc);
                if (seasons.length) {
                    _this.showItems(seasons, 'season');
                    return;
                }

                // 3) Фильм — vod ID
                var vodMatch = text.match(/https?:\/\/zetvideo\.net\/vod\/(\d+)/);
                if (vodMatch) {
                    _this.activity.loader(false);
                    _this.resolveAndPlay(vodMatch[1], object.page_title || 'UAFlix');
                    return;
                }

                // 4) Прямой m3u8
                var direct = text.match(/https?:\/\/zetvideo\.net\/vid\/[^"'\s]+\.m3u8/);
                if (direct) {
                    _this.activity.loader(false);
                    playWithQualities(direct[0], object.page_title || 'UAFlix');
                    return;
                }

                _this.showEmpty();

            }, function () {
                _this.showEmpty();
            });
        };

        this.parseEpisodes = function (doc) {
            var episodes = [];
            var seen = {};

            var container = doc.querySelector('#sers-wr');
            var links = container
                ? container.querySelectorAll('a')
                : doc.querySelectorAll('a[href*="episode"]');

            links.forEach(function (a) {
                var href = a.getAttribute('href') || '';
                if (!href || href === '#' || seen[href]) return;
                seen[href] = true;

                var t = a.textContent.trim();
                var epMatch = href.match(/episode-?(\d+)/i);

                episodes.push({
                    title: t || ('Серія ' + (episodes.length + 1)),
                    url: href.startsWith('http') ? href : UAFIX + href
                });
            });

            return episodes;
        };

        this.parseSeasons = function (doc) {
            var seasons = [];
            var seen = {};

            doc.querySelectorAll('a[href*="sezon-"], a[href*="season-"]').forEach(function (a) {
                var href = a.getAttribute('href') || '';
                if (!href || href === '#' || seen[href]) return;
                if (href.match(/episode/i)) return;
                seen[href] = true;

                var t = a.textContent.trim();
                seasons.push({
                    title: t || ('Сезон ' + (seasons.length + 1)),
                    url: href.startsWith('http') ? href : UAFIX + href
                });
            });

            return seasons;
        };

        this.showItems = function (items, type) {
            var _this = this;

            _this.activity.loader(false);
            _this.activity.toggle();

            items.forEach(function (item) {
                var el = $('<div class="selector" style="padding:0.5em 0">' +
                    '<div style="padding:0.7em 1em;background:rgba(255,255,255,0.06);border-radius:0.3em">' +
                    '<div style="font-size:1.3em;color:white">' + escapeHtml(item.title) + '</div>' +
                    '</div></div>');

                el.on('hover:enter', function () {
                    if (type === 'episode') {
                        _this.loadEpisode(item.url, item.title);
                    } else {
                        Lampa.Activity.push({
                            url: '',
                            title: item.title,
                            component: 'uafix_page',
                            page_url: item.url,
                            page_title: item.title,
                            movie: object.movie
                        });
                    }
                }).on('hover:focus', function (e) {
                    last = e.target;
                    scroll.update($(e.target), true);
                });

                scroll.append(el);
            });

            Lampa.Controller.enable('content');
        };

        this.loadEpisode = function (url, title) {
            var _this = this;

            _this.activity.loader(true);

            getRequest(url, function (text) {
                _this.activity.loader(false);

                var vodMatch = text.match(/https?:\/\/zetvideo\.net\/vod\/(\d+)/);
                if (vodMatch) {
                    _this.resolveAndPlay(vodMatch[1], title);
                    return;
                }

                var direct = text.match(/https?:\/\/zetvideo\.net\/vid\/[^"'\s]+\.m3u8/);
                if (direct) {
                    playWithQualities(direct[0], title);
                    return;
                }

                Lampa.Noty.show('Потік не знайдено');

            }, function () {
                _this.activity.loader(false);
                Lampa.Noty.show('Помилка завантаження');
            });
        };

        this.resolveAndPlay = function (vodId, title) {
            var _this = this;

            _this.activity.loader(true);

            getRequest(ZET + '/vod/' + vodId, function (text) {
                _this.activity.loader(false);

                var m3u8 = null;

                var m = text.match(/https?:\/\/zetvideo\.net\/vid\/[^"'\s]+\.m3u8/);
                if (m) { m3u8 = m[0]; }

                if (!m3u8) {
                    var v = text.match(/<video[^>]+src=["']([^"']+\.m3u8[^"']*)/);
                    if (v) m3u8 = v[1].startsWith('http') ? v[1] : ZET + v[1];
                }

                if (!m3u8) {
                    var a = text.match(/["']([^"'\s]*\.m3u8[^"'\s]*)/);
                    if (a) m3u8 = a[1].startsWith('http') ? a[1] : ZET + a[1];
                }

                if (m3u8) {
                    playWithQualities(m3u8, title);
                } else {
                    Lampa.Noty.show('Потік не знайдено');
                }

            }, function () {
                _this.activity.loader(false);
                Lampa.Noty.show('Помилка ZetVideo');
            });
        };

        this.showEmpty = function () {
            this.activity.loader(false);
            this.activity.toggle();
            scroll.append($('<div style="padding:2em;text-align:center;font-size:1.4em;opacity:0.6">Нічого не знайдено</div>'));
            Lampa.Controller.enable('content');
        };

        this.render  = function () { return files.render(); };
        this.back    = function () { Lampa.Activity.backward(); };
        this.pause   = function () {};
        this.stop    = function () { network.clear(); };
        this.destroy = function () { network.clear(); scroll.destroy(); files.destroy(); };
    }

    // ============ PLAY WITH QUALITIES ============

    function playWithQualities(masterUrl, title) {
        getRequest(masterUrl, function (text) {
            var qualities = {};
            var lines = text.split('\n');

            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim();
                if (line.indexOf('#EXT-X-STREAM-INF') === 0) {
                    var res = line.match(/RESOLUTION=\d+x(\d+)/);
                    var label = res ? res[1] + 'p' : 'auto';

                    if (i + 1 < lines.length) {
                        var next = lines[i + 1].trim();
                        if (next && next.indexOf('#') !== 0) {
                            if (next.indexOf('http') !== 0) {
                                next = masterUrl.replace(/\/[^\/]*$/, '/') + next;
                            }
                            qualities[label] = next;
                        }
                    }
                }
            }

            if (!Object.keys(qualities).length) {
                qualities['auto'] = masterUrl;
            }

            var keys = Object.keys(qualities);

            Lampa.Player.play({
                title: title || 'UAFlix',
                url: qualities[keys[0]],
                quality: qualities
            });

            Lampa.Player.playlist([]);

        }, function () {
            Lampa.Player.play({
                title: title || 'UAFlix',
                url: masterUrl,
                quality: { auto: masterUrl }
            });
            Lampa.Player.playlist([]);
        });
    }

    // ============ REGISTER ============

    Lampa.Component.add(PLUGIN_NAME, uafixComponent);
    Lampa.Component.add('uafix_page', uafixPageComponent);

    Lampa.Listener.follow('full', function (e) {
        if (e.type == 'complite') {
            var render = e.object.activity.render();
            if (!render || render.find('.view--uafix').length) return;

            var btn = $('<div class="full-start__button selector view--uafix">' +
                '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="22" height="22">' +
                '<path d="M8 5v14l11-7z" fill="currentColor"/>' +
                '</svg>' +
                '<span>UAFlix</span>' +
                '</div>');

            btn.on('hover:enter', function () {
                Lampa.Activity.push({
                    url: '',
                    title: 'UAFlix',
                    component: PLUGIN_NAME,
                    search: e.data.movie.title || e.data.movie.name,
                    movie: e.data.movie,
                    page: 1
                });
            });

            render.find('.view--torrent').after(btn);
        }
    });

    console.log('[UAFlix] Plugin loaded');

})();
