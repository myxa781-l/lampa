(function () {
    'use strict';

    if (window.uafix_plugin_loaded) return;
    window.uafix_plugin_loaded = true;

    var UAFIX = 'https://uafix.net';
    var ZET   = 'https://zetvideo.net';
    var PROXY = 'https://uafix-proxy.myxa78.workers.dev/?url=';
    var PLUGIN_NAME = 'uafix_online';

    function parseHTML(text) {
        return (new DOMParser()).parseFromString(text, 'text/html');
    }

    function proxyUrl(url) {
        if (!url) return url;
        return PROXY + encodeURIComponent(url);
    }

    function getRequest(url, success, error) {
        var net = new Lampa.Reguest();
        net.silent(proxyUrl(url), function (data) {
            success(typeof data === 'string' ? data : '');
        }, function (e) {
            if (error) error(e);
        }, false, { dataType: 'text' });
    }

    function escapeHtml(t) {
        return t ? String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : '';
    }

    function formatEp(num) { return (num < 10 ? '0' : '') + num; }

    function getUkrainianTitle(movie, callback) {
        try {
            var type = movie.name ? 'tv' : 'movie';
            Lampa.Api.sources.tmdb.get(type + '/' + movie.id + '/alternative_titles', {}, function (data) {
                var titles = data.titles || data.results || [];
                var ukTitle = '';
                for (var i = 0; i < titles.length; i++) {
                    if (titles[i].iso_3166_1 === 'UA') {
                        ukTitle = titles[i].title;
                        break;
                    }
                }
                if (ukTitle) { callback(ukTitle); return; }
                Lampa.Api.sources.tmdb.get(type + '/' + movie.id, { language: 'uk-UA' }, function (data2) {
                    var name = movie.name ? data2.name : data2.title;
                    var ruTitle = movie.title || movie.name || '';
                    if (name && name !== ruTitle) { callback(name); return; }
                    callback('');
                }, function () { callback(''); });
            }, function () { callback(''); });
        } catch(e) { callback(''); }
    }

    function parseEpisodesFromDoc(doc) {
        var episodes = [], seen = {};
        doc.querySelectorAll('#sers-wr .video-item').forEach(function (el) {
            var a = el.querySelector('a'), titleEl = el.querySelector('.vi-title'), img = el.querySelector('img');
            if (!a) return;
            var href = a.getAttribute('href') || '';
            if (!href || seen[href]) return;
            seen[href] = true;
            var titleText = titleEl ? titleEl.textContent.trim() : '';
            var thumb = img ? (img.getAttribute('data-src') || img.getAttribute('src') || '') : '';
            if (thumb && thumb.indexOf('http') !== 0) thumb = UAFIX + thumb;
            if (href.indexOf('http') !== 0) href = UAFIX + href;
            var epMatch = href.match(/episode-?(\d+)/i);
            var epNum = epMatch ? parseInt(epMatch[1]) : episodes.length + 1;
            episodes.push({ title: titleText || ('Серія ' + epNum), url: href, poster: thumb, episode: epNum });
        });
        return episodes;
    }

    function loadAllPages(baseUrl, page, accumulated, callback) {
        var url = page === 1 ? baseUrl : (baseUrl.indexOf('?') !== -1 ? baseUrl + '&page=' + page : baseUrl + '?page=' + page);
        getRequest(url, function (text) {
            var doc = parseHTML(text);
            var eps = parseEpisodesFromDoc(doc);
            if (eps.length === 0) {
                callback(accumulated);
            } else {
                var newEps = eps.filter(function(ep) {
                    return !accumulated.some(function(a) { return a.url === ep.url; });
                });
                if (newEps.length === 0) {
                    callback(accumulated);
                } else {
                    var all = accumulated.concat(newEps);
                    if (page < 20) {
                        loadAllPages(baseUrl, page + 1, all, callback);
                    } else {
                        callback(all);
                    }
                }
            }
        }, function () { callback(accumulated); });
    }

    function resolveEpisodeStream(url, callback) {
        getRequest(url, function (text) {
            var vodMatch = text.match(/zetvideo\.net\/vod\/(\d+)/);
            if (vodMatch) {
                getRequest(ZET + '/vod/' + vodMatch[1], function (html) {
                    var f = html.match(/file:"([^"]+\.m3u8[^"]*)"/);
                    if (f) { getMasterQualities(f[1], callback); return; }
                    var m = html.match(/https?:\/\/zetvideo\.net\/vid\/[^"'\s]+\.m3u8/);
                    if (m) { getMasterQualities(m[0], callback); return; }
                    callback(null, null);
                }, function () { callback(null, null); });
            } else { callback(null, null); }
        }, function () { callback(null, null); });
    }
function getMasterQualities(masterUrl, callback) {
    var proxied = proxyUrl(masterUrl);
    fetch(proxied).then(function(r){ return r.text(); }).then(function(text) {
        var qualities = {}, lines = text.split('\n');
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (line.indexOf('#EXT-X-STREAM-INF') === 0) {
                var res = line.match(/RESOLUTION=\d+x(\d+)/);
                var label = res ? res[1] + 'p' : 'auto';
                if (i + 1 < lines.length) {
                    var next = lines[i + 1].trim();
                    if (next && next.indexOf('#') !== 0) {
                        qualities[label] = next;
                    }
                }
            }
        }
        if (!Object.keys(qualities).length) qualities['auto'] = proxied;
        var sorted = Object.keys(qualities).sort(function(a,b){ return (parseInt(b)||0)-(parseInt(a)||0); });
        var sQ = {}; sorted.forEach(function(k){ sQ[k] = qualities[k]; });
        callback(sQ[sorted[0]], sQ);
    }).catch(function(){ callback(proxied, {auto: proxied}); });
}
   

    // ============ SEARCH COMPONENT ============

    function uafixComponent(object) {
        var network = new Lampa.Reguest();
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var files = new Lampa.Explorer(object);
        var filter = new Lampa.Filter(object);
        var last = false, initialized = false;

        this.create = function () { return this.render(); };

        this.start = function () {
            var _this = this;
            if (Lampa.Activity.active().activity !== this.activity) return;
            Lampa.Background.immediately(Lampa.Utils.cardImgBackgroundBlur(object.movie));

            if (!initialized) {
                initialized = true;

                filter.onBack = function () { _this.start(); };
                filter.onSearch = function (value) {
                    Lampa.Activity.replace({ search: value, clarification: true });
                };

                files.appendHead(filter.render());
                files.appendFiles(scroll.render());

                scroll.minus(files.render().find('.explorer__files-head'));
                scroll.body().addClass('torrent-list');

                _this.doSearch();
            }

            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render(), files.render());
                    Lampa.Controller.collectionFocus(last || false, scroll.render());
                },
                up: function () { if (Navigator.canmove('up')) Navigator.move('up'); else Lampa.Controller.toggle('head'); },
                down: function () { Navigator.move('down'); },
                right: function () { if (Navigator.canmove('right')) Navigator.move('right'); else filter.show('Фільтр', 'filter'); },
                left: function () { if (Navigator.canmove('left')) Navigator.move('left'); else Lampa.Controller.toggle('menu'); },
                back: this.back
            });
            Lampa.Controller.toggle('content');
        };

        this.doSearch = function () {
            var _this = this;
            var movie = object.movie;
            var title = movie.title || movie.name || '';
            var origTitle = movie.original_title || movie.original_name || '';
            var query = object.search || title;

            if (!query) { _this.showEmpty(); return; }
            _this.activity.loader(true);

            _this.searchQuery(query, function (r1) {
                if (r1.length) { _this.done(r1); return; }
                if (origTitle && origTitle !== query) {
                    _this.searchQuery(origTitle, function (r2) {
                        if (r2.length) { _this.done(r2); return; }
                        _this.tryUkrTitle(movie);
                    });
                } else { _this.tryUkrTitle(movie); }
            });
        };

        this.tryUkrTitle = function (movie) {
            var _this = this;
            getUkrainianTitle(movie, function (ukTitle) {
                if (ukTitle) {
                    _this.searchQuery(ukTitle, function (r3) {
                        if (r3.length) { _this.done(r3); return; }
                        _this.tryKeywords(movie);
                    });
                } else { _this.tryKeywords(movie); }
            });
        };

        this.tryKeywords = function (movie) {
            var _this = this;
            var title = movie.title || movie.name || '';
            var words = title.split(/[\s,.:;!?]+/).filter(function(w) { return w.length > 3; });
            words.sort(function(a, b) { return b.length - a.length; });
            var keyword = words[0] || '';

            if (keyword && keyword !== title) {
                _this.searchQuery(keyword, function (r4) {
                    if (r4.length) { _this.done(r4); return; }
                    _this.showEmpty();
                });
            } else {
                _this.showEmpty();
            }
        };

        this.done = function (results) {
            this.activity.loader(false);
            this.activity.toggle();
            this.drawResults(results);
        };

        this.searchQuery = function (query, callback) {
            getRequest(UAFIX + '/index.php?do=search&subaction=search&story=' + encodeURIComponent(query), function (text) {
                var doc = parseHTML(text), results = [];
                doc.querySelectorAll('.sres-wrap').forEach(function (el) {
                    var link = el.getAttribute('href') || '';
                    var h2 = el.querySelector('.sres-text h2');
                    var img = el.querySelector('img');
                    var title = h2 ? h2.textContent.trim() : '';
                    var poster = img ? (img.getAttribute('src') || '') : '';
                    if (link && title) {
                        if (link.indexOf('http') !== 0) link = UAFIX + link;
                        if (poster && poster.indexOf('http') !== 0) poster = UAFIX + poster;
                        results.push({ title: title, url: link, poster: poster });
                    }
                });
                callback(results);
            }, function () { callback([]); });
        };

        this.drawResults = function (results) {
            var _this = this;
            results.forEach(function (r) {
                var item = $('<div class="selector" style="padding:0.5em 0"><div class="uafix-item" style="display:flex;align-items:center;padding:0.8em 1em;background:rgba(255,255,255,0.06);border-radius:0.3em;transition:background 0.1s">' +
                    (r.poster ? '<div style="width:4em;height:5.5em;flex-shrink:0;margin-right:1em;border-radius:0.2em;overflow:hidden;background:#111"><img src="' + escapeHtml(r.poster) + '" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display=\'none\'"></div>' : '') +
                    '<div style="font-size:1.3em;color:white">' + escapeHtml(r.title) + '</div></div></div>');

                item.on('hover:enter', function () {
                    Lampa.Activity.push({ url:'', title:'UAFlix', component:'uafix_page', page_url:r.url, page_title:r.title, movie:object.movie });
                }).on('hover:focus', function (e) {
                    last = e.target;
                    scroll.update($(e.target), true);
                    $(e.target).find('.uafix-item').css({ 'background': 'rgba(255,255,255,0.2)', 'outline': '2px solid rgba(255,255,255,0.8)', 'outline-offset': '-2px' });
                }).on('hover:blur', function (e) {
                    $(e.target).find('.uafix-item').css({ 'background': 'rgba(255,255,255,0.06)', 'outline': 'none' });
                });

                scroll.append(item);
            });
            Lampa.Controller.enable('content');
        };

        this.showEmpty = function () {
            this.activity.loader(false); this.activity.toggle();
            scroll.append($('<div style="padding:2em;text-align:center;font-size:1.4em;opacity:0.6">Нічого не знайдено</div>'));
            Lampa.Controller.enable('content');
        };

        this.render = function () { return files.render(); };
        this.back = function () { Lampa.Activity.backward(); };
        this.pause = function () {};
        this.stop = function () { network.clear(); };
        this.destroy = function () { network.clear(); scroll.destroy(); files.destroy(); };
    }

    // ============ PAGE COMPONENT ============

    function uafixPageComponent(object) {
        var network = new Lampa.Reguest();
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var files = new Lampa.Explorer(object);
        var last = false, initialized = false;
        var allEpisodes = [];

        this.create = function () { return this.render(); };

        this.start = function () {
            var _this = this;
            if (Lampa.Activity.active().activity !== this.activity) return;
            Lampa.Background.immediately(Lampa.Utils.cardImgBackgroundBlur(object.movie));

            if (!initialized) {
                initialized = true;

                files.appendFiles(scroll.render());
                scroll.minus(files.render().find('.explorer__files-head'));
                scroll.body().addClass('torrent-list');

                _this.loadPage();
            }

            Lampa.Controller.add('content', {
                toggle: function () {
                    Lampa.Controller.collectionSet(scroll.render(), files.render());
                    Lampa.Controller.collectionFocus(last || false, scroll.render());
                },
                up: function () { if (Navigator.canmove('up')) Navigator.move('up'); else Lampa.Controller.toggle('head'); },
                down: function () { Navigator.move('down'); },
                right: function () { Navigator.move('right'); },
                left: function () { if (Navigator.canmove('left')) Navigator.move('left'); else Lampa.Controller.toggle('menu'); },
                back: this.back
            });
            Lampa.Controller.toggle('content');
        };

        this.loadPage = function () {
            var _this = this;
            var url = object.page_url;
            if (!url) { _this.showEmpty(); return; }
            _this.activity.loader(true);

            loadAllPages(url, 1, [], function (eps) {
                if (eps.length) {
                    eps.sort(function (a, b) { return a.episode - b.episode; });
                    allEpisodes = eps;
                    _this.showEpisodes(eps);
                    return;
                }

                getRequest(url, function (text) {
                    var doc = parseHTML(text);
                    var seasons = [], seenS = {};
                    doc.querySelectorAll('a[href*="/sezon-"]').forEach(function (a) {
                        var href = a.getAttribute('href') || '';
                        if (!href || href === '#' || seenS[href] || href.match(/episode/i)) return;
                        seenS[href] = true;
                        if (href.indexOf('http') !== 0) href = UAFIX + href;
                        var sMatch = href.match(/sezon-?(\d+)/i);
                        seasons.push({ title: a.textContent.trim() || ('Сезон ' + (seasons.length+1)), url: href, number: sMatch ? parseInt(sMatch[1]) : seasons.length+1 });
                    });
                    if (seasons.length) { seasons.sort(function(a,b){return a.number-b.number}); _this.showSeasons(seasons); return; }

                    var vodMatch = text.match(/zetvideo\.net\/vod\/(\d+)/);
                    if (vodMatch) { _this.activity.loader(false); _this.playVod(vodMatch[1], object.page_title||'UAFlix'); return; }

                    _this.showEmpty();
                }, function () { _this.showEmpty(); });
            });
        };

        this.showEpisodes = function (episodes) {
            var _this = this;
            _this.activity.loader(false);
            _this.activity.toggle();

            episodes.forEach(function (ep, idx) {
                var item = $('<div class="selector" style="padding:0.5em 0">' +
                    '<div class="uafix-item" style="display:flex;align-items:center;padding:0.5em;background:rgba(0,0,0,0.3);border-radius:0.3em;transition:background 0.1s">' +
                    '<div style="position:relative;width:12em;height:7em;flex-shrink:0;border-radius:0.3em;overflow:hidden;background:#111">' +
                    (ep.poster ? '<img src="' + escapeHtml(ep.poster) + '" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display=\'none\'">' : '') +
                    '<div style="position:absolute;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;font-size:2em;color:white;text-shadow:0 0 8px black">' + formatEp(ep.episode) + '</div>' +
                    '</div>' +
                    '<div style="padding:0 1em;font-size:1.4em;color:white">' + escapeHtml(ep.title) + '</div>' +
                    '</div></div>');

                item.on('hover:enter', function () {
                    _this.playEpisode(ep, idx);
                }).on('hover:focus', function (e) {
                    last = e.target;
                    scroll.update($(e.target), true);
                    $(e.target).find('.uafix-item').css({ 'background': 'rgba(255,255,255,0.2)', 'outline': '2px solid rgba(255,255,255,0.8)', 'outline-offset': '-2px' });
                }).on('hover:blur', function (e) {
                    $(e.target).find('.uafix-item').css({ 'background': 'rgba(0,0,0,0.3)', 'outline': 'none' });
                });

                scroll.append(item);
            });

            Lampa.Controller.enable('content');
        };

        this.showSeasons = function (seasons) {
            var _this = this;
            _this.activity.loader(false);
            _this.activity.toggle();

            seasons.forEach(function (s) {
                var el = $('<div class="selector" style="padding:0.5em 0"><div class="uafix-item" style="padding:1em;background:rgba(255,255,255,0.06);border-radius:0.3em;font-size:1.3em;color:white;transition:background 0.1s">' + escapeHtml(s.title) + '</div></div>');
                el.on('hover:enter', function () {
                    Lampa.Activity.push({ url:'', title:s.title, component:'uafix_page', page_url:s.url, page_title:s.title, movie:object.movie });
                }).on('hover:focus', function (e) {
                    last = e.target;
                    scroll.update($(e.target), true);
                    $(e.target).find('.uafix-item').css({ 'background': 'rgba(255,255,255,0.2)', 'outline': '2px solid rgba(255,255,255,0.8)', 'outline-offset': '-2px' });
                }).on('hover:blur', function (e) {
                    $(e.target).find('.uafix-item').css({ 'background': 'rgba(255,255,255,0.06)', 'outline': 'none' });
                });
                scroll.append(el);
            });
            Lampa.Controller.enable('content');
        };

        this.playEpisode = function (ep, idx) {
            var _this = this;
            _this.activity.loader(true);

            resolveEpisodeStream(ep.url, function (streamUrl, qualities) {
                _this.activity.loader(false);
                if (!streamUrl) { Lampa.Noty.show('Потік не знайдено'); return; }

                var playlist = [];
                allEpisodes.forEach(function (e, i) {
                    var cell = {
                        title: e.title,
                        quality: (i === idx) ? (qualities || {}) : {},
                        url: ''
                    };

                    if (i === idx) {
                        cell.url = streamUrl;
                    } else {
                        cell.url = function (call) {
                            resolveEpisodeStream(e.url, function (sUrl, sQ) {
                                if (sUrl) {
                                    cell.url = sUrl;
                                    cell.quality = sQ || {};
                                } else {
                                    cell.url = '';
                                }
                                call();
                            });
                        };
                    }

                    playlist.push(cell);
                });

                Lampa.Player.play({
                    title: ep.title || 'UAFlix',
                    url: streamUrl,
                    quality: qualities || {}
                });

                Lampa.Player.playlist(playlist);
            });
        };

        this.playVod = function (vodId, title) {
            var _this = this;
            _this.activity.loader(true);
            getRequest(ZET + '/vod/' + vodId, function (html) {
                _this.activity.loader(false);
                var f = html.match(/file:"([^"]+\.m3u8[^"]*)"/);
                if (f) { getMasterQualities(f[1], function (url, q) { Lampa.Player.play({title:title,url:url,quality:q}); Lampa.Player.playlist([]); }); return; }
                Lampa.Noty.show('Потік не знайдено');
            }, function () { _this.activity.loader(false); Lampa.Noty.show('Помилка'); });
        };

        this.showEmpty = function () {
            this.activity.loader(false); this.activity.toggle();
            scroll.append($('<div style="padding:2em;text-align:center;font-size:1.4em;opacity:0.6">Нічого не знайдено</div>'));
            Lampa.Controller.enable('content');
        };

        this.render = function () { return files.render(); };
        this.back = function () { Lampa.Activity.backward(); };
        this.pause = function () {};
        this.stop = function () { network.clear(); };
        this.destroy = function () { network.clear(); scroll.destroy(); files.destroy(); };
    }

    // ============ REGISTER ============

    Lampa.Component.add(PLUGIN_NAME, uafixComponent);
    Lampa.Component.add('uafix_page', uafixPageComponent);

    Lampa.Listener.follow('full', function (e) {
        if (e.type == 'complite') {
            var render = e.object.activity.render();
            if (!render || render.find('.view--uafix').length) return;

            var btn = $('<div class="full-start__button selector view--uafix">' +
                '<svg viewBox="0 0 24 24" fill="none" width="22" height="22"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>' +
                '<span>UAFlix</span></div>');

            btn.on('hover:enter', function () {
                Lampa.Activity.push({ url:'', title:'UAFlix', component:PLUGIN_NAME, search:e.data.movie.title||e.data.movie.name, movie:e.data.movie, page:1 });
            });

            render.find('.view--torrent').after(btn);
        }
    });

    console.log('[UAFlix] Plugin loaded');
})();
