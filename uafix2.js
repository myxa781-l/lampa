(function () {
    'use strict';

    if (window.uafix_plugin_loaded) return;
    window.uafix_plugin_loaded = true;

    var UAFIX = 'https://uafix.net';
    var ZET   = 'https://zetvideo.net';
    var PROXY = 'https://uafix-proxy.myxa78.workers.dev/?url=';
    var PLUGIN_NAME = 'uafix_online';

    // ============ FOCUS CSS ============

    var style = $('<style>\
        .online.focus, .torrent-list .selector.focus { background: rgba(255,255,255,0.1); outline: 2px solid rgba(255,255,255,0.8); outline-offset: -2px; border-radius: 0.3em; }\
    </style>');
    $('head').append(style);

    // ============ TEMPLATES ============

    Lampa.Template.add('uafix_item', '<div class="online selector">\
        <div class="online__body">\
            <div style="position:absolute;left:0;top:-0.3em;width:2.4em;height:2.4em">\
                <svg style="height:2.4em;width:2.4em" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">\
                    <circle cx="64" cy="64" r="56" stroke="white" stroke-width="16"/>\
                    <path d="M90.5 64.3827L50 87.7654L50 41L90.5 64.3827Z" fill="white"/>\
                </svg>\
            </div>\
            <div class="online__title" style="padding-left:2.1em">{title}</div>\
            <div class="online__quality" style="padding-left:3.4em">{quality}</div>\
        </div>\
    </div>');

    Lampa.Template.add('uafix_folder', '<div class="online selector">\
        <div class="online__body">\
            <div style="position:absolute;left:0;top:-0.3em;width:2.4em;height:2.4em">\
                <svg style="height:2.4em;width:2.4em" viewBox="0 0 128 112" fill="none" xmlns="http://www.w3.org/2000/svg">\
                    <rect y="20" width="128" height="92" rx="13" fill="white"/>\
                    <path d="M29.9963 8H98.0037C96.0446 3.3021 91.4079 0 86 0H42C36.5921 0 31.9555 3.3021 29.9963 8Z" fill="white" fill-opacity="0.23"/>\
                    <rect x="11" y="8" width="106" height="76" rx="13" fill="white" fill-opacity="0.51"/>\
                </svg>\
            </div>\
            <div class="online__title" style="padding-left:2.1em">{title}</div>\
            <div class="online__quality" style="padding-left:3.4em">{quality}</div>\
        </div>\
    </div>');

    // ============ HELPERS ============

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

    function formatEp(num) { return (num < 10 ? '0' : '') + num; }

    function getUkrainianTitle(movie, callback) {
        try {
            var type = movie.name ? 'tv' : 'movie';
            Lampa.Api.sources.tmdb.get(type + '/' + movie.id + '/alternative_titles', {}, function (data) {
                var titles = data.titles || data.results || [];
                var ukTitle = '';
                for (var i = 0; i < titles.length; i++) {
                    if (titles[i].iso_3166_1 === 'UA') { ukTitle = titles[i].title; break; }
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

            var season = 1;
            var sFromUrl = href.match(/sezon-?(\d+)/i);
            if (sFromUrl) { season = parseInt(sFromUrl[1]); }
            else { var sFromTitle = titleText.match(/[Сс]езон\s*(\d+)/i); if (sFromTitle) season = parseInt(sFromTitle[1]); }

            episodes.push({ title: titleText || ('Серія ' + epNum), url: href, poster: thumb, episode: epNum, season: season });
        });
        return episodes;
    }

    function loadAllPages(baseUrl, page, accumulated, callback) {
        var url = page === 1 ? baseUrl : (baseUrl.indexOf('?') !== -1 ? baseUrl + '&page=' + page : baseUrl + '?page=' + page);
        getRequest(url, function (text) {
            var doc = parseHTML(text);
            var eps = parseEpisodesFromDoc(doc);
            if (eps.length === 0) { callback(accumulated); return; }
            var newEps = eps.filter(function(ep) { return !accumulated.some(function(a) { return a.url === ep.url; }); });
            if (newEps.length === 0) { callback(accumulated); return; }
            var all = accumulated.concat(newEps);
            if (page < 20) { loadAllPages(baseUrl, page + 1, all, callback); }
            else { callback(all); }
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
                        if (next && next.indexOf('#') !== 0) { qualities[label] = next; }
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

        this.append = function (item) {
            item.on('hover:focus', function (e) {
                last = e.target;
                scroll.update($(e.target), true);
            });
            scroll.append(item);
        };

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

        this.reset = function () {
            last = false;
            scroll.clear();
            scroll.reset();
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
            } else { _this.showEmpty(); }
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
            _this.reset();
            results.forEach(function (r) {
                var item = Lampa.Template.get('uafix_folder', { title: r.title, quality: '' });
                item.on('hover:enter', function () {
                    Lampa.Activity.push({ url:'', title:'UAFlix', component:'uafix_page', page_url:r.url, page_title:r.title, movie:object.movie });
                });
                _this.append(item);
            });
            Lampa.Controller.enable('content');
        };

        this.showEmpty = function () {
            this.activity.loader(false);
            this.activity.toggle();
            this.reset();
            var empty = $('<div class="empty"><div style="padding:2em;text-align:center;font-size:1.4em;opacity:0.6">Нічого не знайдено</div></div>');
            scroll.append(empty);
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
        var scroll = new Lampa.Scroll({ mask: true, over: true });
        var files = new Lampa.Explorer(object);
        var filter = new Lampa.Filter(object);
        var last = false, initialized = false;
        var allEpisodes = [];
        var seasonNums = [];
        var chosenSeason = 0; // индекс в seasonNums, 0 = "Всі"

        this.create = function () { return this.render(); };

        this.append = function (item) {
            item.on('hover:focus', function (e) {
                last = e.target;
                scroll.update($(e.target), true);
            });
            scroll.append(item);
        };

        this.reset = function () {
            last = false;
            scroll.render().find('.empty').remove();
            scroll.clear();
            scroll.reset();
        };

        this.start = function () {
            var _this = this;
            if (Lampa.Activity.active().activity !== this.activity) return;
            Lampa.Background.immediately(Lampa.Utils.cardImgBackgroundBlur(object.movie));

            if (!initialized) {
                initialized = true;

                filter.onBack = function () { _this.start(); };
                filter.onSelect = function (type, a, b) {
                    if (type === 'filter' && a.stype === 'season') {
                        chosenSeason = b.index;
                        _this.buildFilter();
                        _this.renderEpisodes();
                    }
                };

                files.appendHead(filter.render());
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
                right: function () {
                    if (Navigator.canmove('right')) Navigator.move('right');
                    else if (seasonNums.length > 1) filter.show('Сезон', 'filter');
                },
                left: function () { if (Navigator.canmove('left')) Navigator.move('left'); else Lampa.Controller.toggle('menu'); },
                back: this.back
            });
            Lampa.Controller.toggle('content');
        };

        this.buildFilter = function () {
            if (seasonNums.length <= 1) return;

            var names = ['Всі сезони'];
            seasonNums.forEach(function (s) { names.push('Сезон ' + s); });

            var subitems = names.map(function (name, i) {
                return { title: name, selected: chosenSeason === i, index: i };
            });

            filter.set('filter', [{
                title: 'Сезон',
                subtitle: names[chosenSeason],
                items: subitems,
                stype: 'season'
            }]);

            filter.chosen('filter', chosenSeason > 0 ? ['Сезон ' + seasonNums[chosenSeason - 1]] : []);
        };

        this.getFilteredEpisodes = function () {
            if (chosenSeason > 0 && seasonNums[chosenSeason - 1]) {
                var s = seasonNums[chosenSeason - 1];
                return allEpisodes.filter(function (ep) { return ep.season === s; });
            }
            return allEpisodes;
        };

        this.renderEpisodes = function () {
            var _this = this;
            _this.reset();
            var eps = _this.getFilteredEpisodes();

            eps.forEach(function (ep) {
                var realIdx = allEpisodes.indexOf(ep);
                var item = Lampa.Template.get('uafix_item', {
                    title: ep.title,
                    quality: 'S' + formatEp(ep.season) + 'E' + formatEp(ep.episode)
                });
                item.on('hover:enter', function () {
                    _this.playEpisode(ep, realIdx);
                });
                _this.append(item);
            });

            Lampa.Controller.enable('content');
        };

        this.loadPage = function () {
            var _this = this;
            var url = object.page_url;
            if (!url) { _this.showEmpty(); return; }
            _this.activity.loader(true);

            loadAllPages(url, 1, [], function (eps) {
                if (eps.length) {
                    eps.sort(function (a, b) {
                        if (a.season !== b.season) return a.season - b.season;
                        return a.episode - b.episode;
                    });
                    allEpisodes = eps;

                    // detect seasons
                    var seen = {};
                    eps.forEach(function (ep) { seen[ep.season] = true; });
                    seasonNums = Object.keys(seen).map(Number).sort(function(a,b){return a-b;});

                    _this.activity.loader(false);
                    _this.activity.toggle();
                    _this.buildFilter();
                    _this.renderEpisodes();
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
                    if (seasons.length) {
                        seasons.sort(function(a,b){return a.number-b.number});
                        _this.activity.loader(false);
                        _this.activity.toggle();
                        _this.showSeasons(seasons);
                        return;
                    }

                    var vodMatch = text.match(/zetvideo\.net\/vod\/(\d+)/);
                    if (vodMatch) { _this.activity.loader(false); _this.playVod(vodMatch[1], object.page_title||'UAFlix'); return; }

                    _this.showEmpty();
                }, function () { _this.showEmpty(); });
            });
        };

        this.showSeasons = function (seasons) {
            var _this = this;
            seasons.forEach(function (s) {
                var item = Lampa.Template.get('uafix_folder', { title: s.title, quality: '' });
                item.on('hover:enter', function () {
                    Lampa.Activity.push({ url:'', title:s.title, component:'uafix_page', page_url:s.url, page_title:s.title, movie:object.movie });
                });
                _this.append(item);
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
                    var cell = { title: e.title, quality: (i === idx) ? (qualities || {}) : {}, url: '' };
                    if (i === idx) { cell.url = streamUrl; }
                    else {
                        cell.url = function (call) {
                            resolveEpisodeStream(e.url, function (sUrl, sQ) {
                                if (sUrl) { cell.url = sUrl; cell.quality = sQ || {}; }
                                else { cell.url = ''; }
                                call();
                            });
                        };
                    }
                    playlist.push(cell);
                });

                Lampa.Player.play({ title: ep.title || 'UAFlix', url: streamUrl, quality: qualities || {} });
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
            this.activity.loader(false);
            this.activity.toggle();
            this.reset();
            var empty = $('<div class="empty"><div style="padding:2em;text-align:center;font-size:1.4em;opacity:0.6">Нічого не знайдено</div></div>');
            scroll.append(empty);
            Lampa.Controller.enable('content');
        };

        this.render  = function () { return files.render(); };
        this.back    = function () { Lampa.Activity.backward(); };
        this.pause   = function () {};
        this.stop    = function () { network.clear(); };
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
