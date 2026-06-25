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

    function proxyStream(url) {
        if (!url) return url;
        var player = Lampa.Storage.field('player');
        if (player && player !== 'inner') return url;
        return proxyUrl(url);
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

    // Получить альтернативные названия для поиска
    function getAlternativeTitles(movie, callback) {
        try {
            var type = movie.name ? 'tv' : 'movie';

            // 1) Пробуем uk-UA
            Lampa.Api.sources.tmdb.get(type + '/' + movie.id, { language: 'uk-UA' }, function (data) {
                var ukName = movie.name ? data.name : data.title;
                var ruTitle = movie.title || movie.name || '';

                if (ukName && ukName !== ruTitle) {
                    callback([ukName]);
                    return;
                }

                // 2) alternative_titles
                Lampa.Api.sources.tmdb.get(type + '/' + movie.id + '/alternative_titles', {}, function (d) {
                    var titles = d.titles || d.results || [];
                    var names = [];

                    // UA первым
                    titles.forEach(function (t) { if (t.iso_3166_1 === 'UA' && t.title) names.push(t.title); });
                    // Потом EN
                    titles.forEach(function (t) { if ((t.iso_3166_1 === 'US' || t.iso_3166_1 === 'GB') && t.title && names.indexOf(t.title) === -1) names.push(t.title); });

                    callback(names);
                }, function () { callback([]); });
            }, function () { callback([]); });
        } catch(e) { callback([]); }
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
            if (eps.length === 0) { callback(accumulated); }
            else {
                var all = accumulated.concat(eps);
                if (page < 20) loadAllPages(baseUrl, page + 1, all, callback);
                else callback(all);
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
        getRequest(masterUrl, function (text) {
            var qualities = {}, lines = text.split('\n');
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].trim();
                if (line.indexOf('#EXT-X-STREAM-INF') === 0) {
                    var res = line.match(/RESOLUTION=\d+x(\d+)/);
                    var label = res ? res[1] + 'p' : 'auto';
                    if (i + 1 < lines.length) {
                        var next = lines[i + 1].trim();
                        if (next && next.indexOf('#') !== 0) {
                            if (next.indexOf('http') !== 0) next = masterUrl.replace(/\/[^\/]*$/, '/') + next;
                            qualities[label] = proxyStream(next);
                        }
                    }
                }
            }
            if (!Object.keys(qualities).length) qualities['auto'] = proxyStream(masterUrl);
            var sorted = Object.keys(qualities).sort(function (a, b) { return (parseInt(b)||0) - (parseInt(a)||0); });
            var sQ = {}; sorted.forEach(function (k) { sQ[k] = qualities[k]; });
            callback(sQ[sorted[0]], sQ);
        }, function () { callback(proxyStream(masterUrl), {auto: proxyStream(masterUrl)}); });
    }

    // Timeline hash (как в Bandera)
    function getTimelineHash(movie, season, episode) {
        var title = movie.original_title || movie.original_name || movie.name || movie.title || '';
        return Lampa.Utils.hash(season ? [season, episode, title].join('') : title);
    }

    function getViewedHash(movie, season, episode, voice) {
        var title = movie.original_title || movie.original_name || movie.name || movie.title || '';
        return Lampa.Utils.hash(season ? [season, episode, title, voice || ''].join('') : title + (voice || ''));
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
                        _this.tryAlternatives(movie);
                    });
                } else { _this.tryAlternatives(movie); }
            });
        };

        this.tryAlternatives = function (movie) {
            var _this = this;
            getAlternativeTitles(movie, function (titles) {
                _this.tryNextTitle(titles, 0);
            });
        };

        this.tryNextTitle = function (titles, idx) {
            var _this = this;
            if (idx >= titles.length) {
                // Последний fallback: ключевое слово
                _this.tryKeyword();
                return;
            }
            _this.searchQuery(titles[idx], function (r) {
                if (r.length) { _this.done(r); return; }
                _this.tryNextTitle(titles, idx + 1);
            });
        };

        this.tryKeyword = function () {
            var _this = this;
            var title = object.movie.title || object.movie.name || '';
            var words = title.split(/[\s,.:;!?]+/).filter(function(w) { return w.length > 3; });
            words.sort(function(a, b) { return b.length - a.length; });
            var keyword = words[0] || '';
            if (keyword && keyword !== title) {
                _this.searchQuery(keyword, function (r) {
                    if (r.length) { _this.done(r); return; }
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
            results.forEach(function (r) {
                var item = $('<div class="selector" style="padding:0.5em 0"><div style="display:flex;align-items:center;padding:0.8em 1em;background:rgba(255,255,255,0.06);border-radius:0.3em">' +
                    (r.poster ? '<div style="width:4em;height:5.5em;flex-shrink:0;margin-right:1em;border-radius:0.2em;overflow:hidden;background:#111"><img src="' + escapeHtml(r.poster) + '" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display=\'none\'"></div>' : '') +
                    '<div style="font-size:1.3em;color:white">' + escapeHtml(r.title) + '</div></div></div>');
                item.on('hover:enter', function () {
                    Lampa.Activity.push({ url:'', title:'UAFlix', component:'uafix_page', page_url:r.url, page_title:r.title, movie:object.movie });
                }).on('hover:focus', function (e) { last = e.target; scroll.update($(e.target), true); });
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
        var tmdbEpisodes = [];

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

                    // Загружаем TMDB данные для длительности
                    var season = 1;
                    var sMatch = (eps[0].url || '').match(/season-?(\d+)/i);
                    if (sMatch) season = parseInt(sMatch[1]);

                    _this.loadTmdbEpisodes(season, function () {
                        _this.showEpisodes(eps, season);
                    });
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

        // Загрузка данных TMDB (длительность, рейтинг)
        this.loadTmdbEpisodes = function (season, callback) {
            var movie = object.movie;
            var id = movie.id;
            if (id && movie.name) {
                try {
                    Lampa.Api.sources.tmdb.get('tv/' + id + '/season/' + season, {}, function (data) {
                        tmdbEpisodes = data.episodes || [];
                        callback();
                    }, function () { callback(); });
                } catch(e) { callback(); }
            } else { callback(); }
        };

        this.showEpisodes = function (episodes, season) {
            var _this = this;
            _this.activity.loader(false);
            _this.activity.toggle();

            var viewed = Lampa.Storage.cache('online_view', 5000, []);
            var movie = object.movie;
            var isSerial = movie.name ? true : false;

            episodes.forEach(function (ep, idx) {
                var tmdbEp = tmdbEpisodes.find(function (e) { return e.episode_number == ep.episode; });
                var runtime = tmdbEp ? tmdbEp.runtime : (movie.runtime || 0);
                var timeText = runtime ? Lampa.Utils.secondsToTime(runtime * 60, true) : '';

                var hashTimeline = getTimelineHash(movie, season, ep.episode);
                var hashViewed = getViewedHash(movie, season, ep.episode, 'UAFlix');

                var timeline = Lampa.Timeline.view(hashTimeline);

                var title = tmdbEp ? tmdbEp.name : ep.title;
                var rating = tmdbEp && tmdbEp.vote_average ? parseFloat(tmdbEp.vote_average).toFixed(1) : '';
                var stillPath = tmdbEp ? tmdbEp.still_path : '';
                var poster = stillPath ? Lampa.TMDB.image('t/p/w300' + stillPath) : ep.poster;

                // Инфо строка
                var info = [];
                if (rating) info.push('<span>★ ' + rating + '</span>');
                if (tmdbEp && tmdbEp.air_date) info.push('<span>' + Lampa.Utils.parseTime(tmdbEp.air_date).full + '</span>');
                var infoHtml = info.join('<span style="margin:0 0.5em;opacity:0.5">●</span>');

                var isViewed = viewed.indexOf(hashViewed) !== -1;

                var html = $('<div class="selector" style="padding:0.5em 0">' +
                    '<div style="display:flex;background:rgba(0,0,0,0.3);border-radius:0.3em;position:relative">' +
                    // Постер
                    '<div style="position:relative;width:13em;min-height:8em;flex-shrink:0;border-radius:0.3em;overflow:hidden;background:#111">' +
                    (poster ? '<img src="' + escapeHtml(poster) + '" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover" onerror="this.style.display=\'none\'">' : '') +
                    '<div style="position:absolute;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;font-size:2em;color:white;text-shadow:0 0 8px black">' + formatEp(ep.episode) + '</div>' +
                    (isViewed ? '<div style="position:absolute;top:0.5em;left:0.5em;background:rgba(0,0,0,0.5);border-radius:50%;padding:0.2em"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></div>' : '') +
                    '</div>' +
                    // Body
                    '<div style="padding:1em;flex-grow:1">' +
                    '<div style="display:flex;justify-content:space-between;align-items:center">' +
                    '<div style="font-size:1.4em;color:white;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-grow:1">' + escapeHtml(title) + '</div>' +
                    (timeText ? '<div style="padding-left:1em;opacity:0.6;white-space:nowrap">' + timeText + '</div>' : '') +
                    '</div>' +
                    // Timeline
                    '<div class="uafix-timeline" style="margin:0.6em 0"></div>' +
                    // Info
                    (infoHtml ? '<div style="display:flex;align-items:center;opacity:0.6;font-size:0.9em">' + infoHtml + '</div>' : '') +
                    '</div>' +
                    '</div></div>');

                // Рендер timeline
                html.find('.uafix-timeline').append(Lampa.Timeline.render(timeline));

                html.on('hover:enter', function () {
                    if (movie.id) Lampa.Favorite.add('history', movie, 100);
                    _this.playEpisode(ep, idx, season, hashViewed, hashTimeline);
                }).on('hover:focus', function (e) {
                    last = e.target;
                    scroll.update($(e.target), true);
                });

                scroll.append(html);
            });

            Lampa.Controller.enable('content');
        };

        this.showSeasons = function (seasons) {
            var _this = this;
            _this.activity.loader(false);
            _this.activity.toggle();

            seasons.forEach(function (s) {
                var el = $('<div class="selector" style="padding:0.5em 0"><div style="padding:1em;background:rgba(255,255,255,0.06);border-radius:0.3em;font-size:1.3em;color:white">' + escapeHtml(s.title) + '</div></div>');
                el.on('hover:enter', function () {
                    Lampa.Activity.push({ url:'', title:s.title, component:'uafix_page', page_url:s.url, page_title:s.title, movie:object.movie });
                }).on('hover:focus', function (e) { last = e.target; scroll.update($(e.target), true); });
                scroll.append(el);
            });
            Lampa.Controller.enable('content');
        };

        this.playEpisode = function (ep, idx, season, hashViewed, hashTimeline) {
            var _this = this;
            _this.activity.loader(true);

            resolveEpisodeStream(ep.url, function (streamUrl, qualities) {
                _this.activity.loader(false);
                if (!streamUrl) { Lampa.Noty.show('Потік не знайдено'); return; }

                // Отметить просмотренным
                var viewed = Lampa.Storage.cache('online_view', 5000, []);
                if (viewed.indexOf(hashViewed) === -1) {
                    viewed.push(hashViewed);
                    Lampa.Storage.set('online_view', viewed);
                }

                var playlist = [];
                allEpisodes.forEach(function (e, i) {
                    var epSeason = season;
                    var epHashTimeline = getTimelineHash(object.movie, epSeason, e.episode);
                    var epHashViewed = getViewedHash(object.movie, epSeason, e.episode, 'UAFlix');

                    var cell = {
                        title: e.title,
                        quality: (i === idx) ? (qualities || {}) : {},
                        url: '',
                        timeline: Lampa.Timeline.view(epHashTimeline),
                        mark: function () {
                            var v = Lampa.Storage.cache('online_view', 5000, []);
                            if (v.indexOf(epHashViewed) === -1) {
                                v.push(epHashViewed);
                                Lampa.Storage.set('online_view', v);
                            }
                        }
                    };

                    if (i === idx) {
                        cell.url = streamUrl;
                    } else {
                        cell.url = function (call) {
                            resolveEpisodeStream(e.url, function (sUrl, sQ) {
                                if (sUrl) {
                                    cell.url = sUrl;
                                    cell.quality = sQ || {};
                                    cell.mark();
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
                    quality: qualities || {},
                    timeline: Lampa.Timeline.view(hashTimeline)
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
                if (f) { getMasterQualities(f[1], function (url, q) {
                    Lampa.Player.play({ title: title, url: url, quality: q });
                    Lampa.Player.playlist([]);
                }); return; }
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
