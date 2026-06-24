(function () {
    'use strict';

    if (window.uafix_plugin_loaded) return;
    window.uafix_plugin_loaded = true;

    var UAFIX = 'https://uafix.net';
    var ZET   = 'https://zetvideo.net';
    var PROXY = 'https://proxy.m7-club.com/?url=';
    var PLUGIN_NAME = 'uafix_online';

    function parseHTML(text) {
        return (new DOMParser()).parseFromString(text, 'text/html');
    }

    function proxyUrl(url) {
        if (!url) return url;
        // Не проксировать уже проксированные
        if (url.indexOf(PROXY) === 0) return url;
        return PROXY + encodeURIComponent(url);
    }

    function getRequest(url, success, error, useProxy) {
        var finalUrl = useProxy !== false ? proxyUrl(url) : url;
        var net = new Lampa.Reguest();
        net.silent(finalUrl, function (data) {
            if (typeof data === 'string') success(data);
            else {
                try { success(typeof data === 'object' ? JSON.stringify(data) : String(data)); }
                catch(e) { success(''); }
            }
        }, function (e) {
            if (error) error(e);
        }, false, { dataType: 'text' });
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

        this.create = function () { return this.render(); };

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
            var title = object.movie.title || object.movie.name || '';
            var origTitle = object.movie.original_title || object.movie.original_name || '';
            var query = object.search || title;

            if (!query) { _this.showEmpty(); return; }

            _this.activity.loader(true);

            _this.searchQuery(query, function (results) {
                if (results.length) {
                    _this.activity.loader(false);
                    _this.activity.toggle();
                    _this.drawResults(results);
                    return;
                }

                if (origTitle && origTitle !== query) {
                    _this.searchQuery(origTitle, function (results2) {
                        _this.activity.loader(false);
                        _this.activity.toggle();
                        if (results2.length) _this.drawResults(results2);
                        else _this.showEmpty();
                    });
                } else {
                    _this.activity.loader(false);
                    _this.activity.toggle();
                    _this.showEmpty();
                }
            });
        };

        this.searchQuery = function (query, callback) {
            var url = UAFIX + '/index.php?do=search&subaction=search&story=' + encodeURIComponent(query);

            getRequest(url, function (text) {
                var doc = parseHTML(text);
                var results = [];

                doc.querySelectorAll('.sres-wrap').forEach(function (el) {
                    var link = el.getAttribute('href') || '';
                    var h2 = el.querySelector('.sres-text h2');
                    var img = el.querySelector('img');
                    var title = h2 ? h2.textContent.trim() : '';
                    var poster = img ? (img.getAttribute('src') || '') : '';

                    if (link && title) {
                        if (!link.startsWith('http')) link = UAFIX + link;
                        if (poster && !poster.startsWith('http')) poster = UAFIX + poster;
                        results.push({ title: title, url: link, poster: poster });
                    }
                });

                callback(results);
            }, function () {
                callback([]);
            });
        };

        this.drawResults = function (results) {
            var _this = this;

            results.forEach(function (r) {
                var posterHtml = r.poster
                    ? '<div style="width:4em;height:5.5em;flex-shrink:0;margin-right:1em;border-radius:0.2em;overflow:hidden;background:#111">' +
                      '<img src="' + escapeHtml(r.poster) + '" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display=\'none\'">' +
                      '</div>'
                    : '';

                var item = $('<div class="selector" style="padding:0.4em 0">' +
                    '<div style="display:flex;align-items:center;padding:0.7em 1em;background:rgba(255,255,255,0.06);border-radius:0.3em">' +
                    posterHtml +
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

        this.create = function () { return this.render(); };

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

                // 1) Серии — #sers-wr .video-item
                var episodes = [];
                var seenEp = {};

                doc.querySelectorAll('#sers-wr .video-item').forEach(function (el) {
                    var a = el.querySelector('a.vi-img');
                    var titleEl = el.querySelector('.vi-title');
                    var img = el.querySelector('img');

                    if (!a) return;
                    var href = a.getAttribute('href') || '';
                    if (!href || seenEp[href]) return;
                    seenEp[href] = true;

                    var titleText = titleEl ? titleEl.textContent.trim() : '';
                    var thumb = img ? (img.getAttribute('data-src') || img.getAttribute('src') || '') : '';
                    if (thumb && !thumb.startsWith('http')) thumb = UAFIX + thumb;

                    var seasonMatch = titleText.match(/Сезон\s+(\d+)/i);
                    var episodeMatch = titleText.match(/Серія\s+(\d+)/i);
                    var sNum = seasonMatch ? parseInt(seasonMatch[1]) : 1;
                    var eNum = episodeMatch ? parseInt(episodeMatch[1]) : episodes.length + 1;

                    if (!href.startsWith('http')) href = UAFIX + href;

                    episodes.push({
                        title: titleText || ('Серія ' + eNum),
                        url: href,
                        poster: thumb,
                        season: sNum,
                        episode: eNum
                    });
                });

                if (episodes.length) {
                    _this.showEpisodes(episodes);
                    return;
                }

                // 2) Fallback: ссылки с episode
                doc.querySelectorAll('a[href*="episode"]').forEach(function (a) {
                    var href = a.getAttribute('href') || '';
                    if (!href || href === '#' || seenEp[href]) return;
                    seenEp[href] = true;
                    if (!href.startsWith('http')) href = UAFIX + href;
                    episodes.push({
                        title: a.textContent.trim() || ('Серія ' + (episodes.length + 1)),
                        url: href, poster: '', season: 1, episode: episodes.length + 1
                    });
                });

                if (episodes.length) {
                    _this.showEpisodes(episodes);
                    return;
                }

                // 3) Сезоны
                var seasons = [];
                var seenS = {};
                doc.querySelectorAll('a[href*="/sezon-"]').forEach(function (a) {
                    var href = a.getAttribute('href') || '';
                    if (!href || href === '#' || seenS[href]) return;
                    if (href.match(/episode/i)) return;
                    seenS[href] = true;
                    if (!href.startsWith('http')) href = UAFIX + href;
                    seasons.push({
                        title: a.textContent.trim() || ('Сезон ' + (seasons.length + 1)),
                        url: href
                    });
                });

                if (seasons.length) {
                    _this.showSeasons(seasons);
                    return;
                }

                // 4) Табы / iframe плеера
                var tabs = doc.querySelectorAll('.tabs-sel .tabs-link');
                var contents = doc.querySelectorAll('.tabs-b.video-box');
                var players = [];

                if (tabs.length > 0 && contents.length > 0) {
                    tabs.forEach(function (tab, i) {
                        var tabName = tab.textContent.trim();
                        var contentDiv = contents[i];
                        if (!contentDiv) return;
                        var iframe = contentDiv.querySelector('iframe');
                        var src = iframe ? (iframe.getAttribute('src') || iframe.getAttribute('data-src') || '') : '';
                        if (src) players.push({ name: tabName, src: src });
                    });
                } else {
                    var iframeEl = doc.querySelector('.video-box iframe') || doc.querySelector('iframe');
                    if (iframeEl) {
                        var src = iframeEl.getAttribute('src') || iframeEl.getAttribute('data-src') || '';
                        if (src) players.push({ name: 'Дивитись', src: src });
                    }
                }

                if (players.length > 1) {
                    _this.showPlayers(players);
                    return;
                }
                if (players.length === 1) {
                    _this.activity.loader(false);
                    _this.resolveIframe(players[0].src, object.page_title || 'UAFlix');
                    return;
                }

                // 5) vod в HTML
                var vodMatch = text.match(/https?:\/\/zetvideo\.net\/vod\/(\d+)/);
                if (vodMatch) {
                    _this.activity.loader(false);
                    _this.resolveVod(vodMatch[1], object.page_title || 'UAFlix');
                    return;
                }

                _this.showEmpty();
            }, function () {
                _this.showEmpty();
            });
        };

        this.showEpisodes = function (episodes) {
            var _this = this;
            _this.activity.loader(false);
            _this.activity.toggle();

            episodes.forEach(function (ep) {
                var posterHtml = ep.poster
                    ? '<div style="width:8em;height:4.5em;flex-shrink:0;margin-right:1em;border-radius:0.2em;overflow:hidden;background:#111">' +
                      '<img src="' + escapeHtml(ep.poster) + '" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display=\'none\'">' +
                      '</div>'
                    : '';

                var el = $('<div class="selector" style="padding:0.4em 0">' +
                    '<div style="display:flex;align-items:center;padding:0.6em 1em;background:rgba(255,255,255,0.06);border-radius:0.3em">' +
                    posterHtml +
                    '<div style="font-size:1.2em;color:white">' + escapeHtml(ep.title) + '</div>' +
                    '</div></div>');

                el.on('hover:enter', function () {
                    _this.loadEpisode(ep.url, ep.title);
                }).on('hover:focus', function (e) {
                    last = e.target;
                    scroll.update($(e.target), true);
                });

                scroll.append(el);
            });

            Lampa.Controller.enable('content');
        };

        this.showSeasons = function (seasons) {
            var _this = this;
            _this.activity.loader(false);
            _this.activity.toggle();

            seasons.forEach(function (s) {
                var el = $('<div class="selector" style="padding:0.4em 0">' +
                    '<div style="padding:0.7em 1em;background:rgba(255,255,255,0.06);border-radius:0.3em">' +
                    '<div style="font-size:1.3em;color:white">' + escapeHtml(s.title) + '</div>' +
                    '</div></div>');

                el.on('hover:enter', function () {
                    Lampa.Activity.push({
                        url: '', title: s.title,
                        component: 'uafix_page',
                        page_url: s.url, page_title: s.title,
                        movie: object.movie
                    });
                }).on('hover:focus', function (e) {
                    last = e.target;
                    scroll.update($(e.target), true);
                });

                scroll.append(el);
            });

            Lampa.Controller.enable('content');
        };

        this.showPlayers = function (players) {
            var _this = this;
            _this.activity.loader(false);
            _this.activity.toggle();

            players.forEach(function (p) {
                var el = $('<div class="selector" style="padding:0.4em 0">' +
                    '<div style="padding:0.7em 1em;background:rgba(255,255,255,0.06);border-radius:0.3em">' +
                    '<div style="font-size:1.3em;color:white">' + escapeHtml(p.name) + '</div>' +
                    '</div></div>');

                el.on('hover:enter', function () {
                    _this.resolveIframe(p.src, p.name);
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
                var doc = parseHTML(text);
                var iframeSrc = '';

                var tabs = doc.querySelectorAll('.tabs-sel .tabs-link');
                var contents = doc.querySelectorAll('.tabs-b.video-box');

                if (tabs.length > 0 && contents.length > 0) {
                    for (var i = 0; i < contents.length; i++) {
                        var iframe = contents[i].querySelector('iframe');
                        if (iframe) {
                            iframeSrc = iframe.getAttribute('src') || iframe.getAttribute('data-src') || '';
                            break;
                        }
                    }
                }

                if (!iframeSrc) {
                    var iframeEl = doc.querySelector('.video-box iframe') || doc.querySelector('iframe');
                    if (iframeEl) iframeSrc = iframeEl.getAttribute('src') || iframeEl.getAttribute('data-src') || '';
                }

                if (iframeSrc) {
                    _this.activity.loader(false);
                    _this.resolveIframe(iframeSrc, title);
                    return;
                }

                var vodMatch = text.match(/https?:\/\/zetvideo\.net\/vod\/(\d+)/);
                if (vodMatch) {
                    _this.activity.loader(false);
                    _this.resolveVod(vodMatch[1], title);
                    return;
                }

                _this.activity.loader(false);
                Lampa.Noty.show('Плеєр не знайдено');
            }, function () {
                _this.activity.loader(false);
                Lampa.Noty.show('Помилка завантаження');
            });
        };

        this.resolveIframe = function (iframeSrc, title) {
            var _this = this;
            _this.activity.loader(true);

            getRequest(iframeSrc, function (html) {
                _this.activity.loader(false);

                var fileMatch = html.match(/file:\s?["']([^"']+\.m3u8)["']/);
                if (fileMatch) { playStream(fileMatch[1], title); return; }

                var rawMatch = html.match(/https?:\/\/[^\s"']+\.m3u8/);
                if (rawMatch) { playStream(rawMatch[0], title); return; }

                var videoMatch = html.match(/<video[^>]+src=["']([^"']+)/);
                if (videoMatch) {
                    var src = videoMatch[1];
                    if (!src.startsWith('http')) src = ZET + src;
                    playStream(src, title);
                    return;
                }

                Lampa.Noty.show('Потік не знайдено');
            }, function () {
                _this.activity.loader(false);
                Lampa.Noty.show('Помилка iframe');
            });
        };

        this.resolveVod = function (vodId, title) {
            var _this = this;
            _this.activity.loader(true);

            getRequest(ZET + '/vod/' + vodId, function (html) {
                _this.activity.loader(false);

                var m = html.match(/https?:\/\/zetvideo\.net\/vid\/[^"'\s]+\.m3u8/);
                if (m) { playStream(m[0], title); return; }

                var v = html.match(/<video[^>]+src=["']([^"']+\.m3u8[^"']*)/);
                if (v) { playStream(v[1].startsWith('http') ? v[1] : ZET + v[1], title); return; }

                var a = html.match(/["']([^"'\s]*\.m3u8[^"'\s]*)/);
                if (a) { playStream(a[1].startsWith('http') ? a[1] : ZET + a[1], title); return; }

                Lampa.Noty.show('Потік не знайдено');
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

    // ============ PLAY ============

    function playStream(masterUrl, title) {
        // Стримы zetvideo тоже нуждаются в проксе
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
                            // Проксируем каждый поток
                            qualities[label] = proxyUrl(next);
                        }
                    }
                }
            }

            if (!Object.keys(qualities).length) qualities['auto'] = proxyUrl(masterUrl);

            Lampa.Player.play({
                title: title || 'UAFlix',
                url: qualities[Object.keys(qualities)[0]],
                quality: qualities
            });
            Lampa.Player.playlist([]);

        }, function () {
            Lampa.Player.play({
                title: title || 'UAFlix',
                url: proxyUrl(masterUrl),
                quality: { auto: proxyUrl(masterUrl) }
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

    console.log('[UAFlix] Plugin loaded (with CORS proxy)');
})();
