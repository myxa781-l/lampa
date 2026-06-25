(function () {
    'use strict';

    if (window.uafix_plugin_loaded) return;
    window.uafix_plugin_loaded = true;

    var API = 'https://bbe.lme.isroot.in/api/v2';
    var SOURCE = 'uaflix';
    var STREAM_PROXY = 'https://proxy.m7-club.com/?url=';
    var PLUGIN_NAME = 'uafix_online';

    function escapeHtml(t) {
        return t ? String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : '';
    }

    function addParam(url, key, val) {
        if (!val) return url;
        return url + (url.indexOf('?') === -1 ? '?' : '&') + key + '=' + encodeURIComponent(val);
    }

    function getYear(movie) {
        var d = movie.release_date || movie.first_air_date || movie.year || '';
        return d ? (d + '').slice(0, 4) : '';
    }

    function isSerial(movie) {
        return movie.name ? 1 : 0;
    }

    function postJson(url, data, success, error) {
        var net = new Lampa.Reguest();
        net.silent(url, success, error, JSON.stringify(data), {
            dataType: 'json',
            headers: { 'Content-Type': 'application/json' }
        });
    }

    function getJson(url, success, error) {
        var net = new Lampa.Reguest();
        net.silent(url, success, error);
    }

    function shouldProxy(url) {
        return url && (/zetvideo\./i.test(url) || /ashdi\.vip/i.test(url));
    }

    function proxyStream(url) {
        if (!url || url.indexOf(STREAM_PROXY) === 0) return url;
        if (shouldProxy(url)) return STREAM_PROXY + url;
        return url;
    }

    // ============ COMPONENT ============

    function uafixComponent(object) {
        var network = new Lampa.Reguest();
        var scroll  = new Lampa.Scroll({ mask: true, over: true });
        var files   = new Lampa.Explorer(object);
        var filter  = new Lampa.Filter(object);
        var last = false;
        var initialized = false;
        var series = null;
        var choice = { season: 0, voice: 0, voice_name: '' };

        this.create = function () { return this.render(); };

        this.start = function () {
            var _this = this;
            if (Lampa.Activity.active().activity !== this.activity) return;
            Lampa.Background.immediately(Lampa.Utils.cardImgBackgroundBlur(object.movie));

            if (!initialized) {
                initialized = true;
                files.appendFiles(scroll.render());
                files.appendHead(filter.render());
                scroll.body().addClass('torrent-list');
                scroll.minus(files.render().find('.explorer__files-head'));

                filter.onBack = function () { _this.start(); };
                filter.onSearch = function (value) {
                    Lampa.Activity.replace({
                        search: value,
                        clarification: true
                    });
                };
                filter.onSelect = function (type, a, b) {
                    if (a.stype === 'voice') { choice.voice = b.index; }
                    if (a.stype === 'season') { choice.season = b.index; }
                    _this.reset();
                    _this.buildEpisodes();
                };

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
                right: function () {
                    if (Navigator.canmove('right')) Navigator.move('right');
                    else filter.show('Фільтр', 'filter');
                },
                left: function () {
                    if (Navigator.canmove('left')) Navigator.move('left');
                    else Lampa.Controller.toggle('menu');
                },
                back: this.back
            });
            Lampa.Controller.toggle('content');
        };

        this.reset = function () {
            last = false;
            scroll.clear();
        };

        this.doSearch = function () {
            var _this = this;
            var movie = object.movie;

            _this.activity.loader(true);

            var url = API + '/search';
            url = addParam(url, 'source', SOURCE);
            url = addParam(url, 'title', movie.title || movie.name || '');
            url = addParam(url, 'original_title', movie.original_title || movie.original_name || '');
            url = addParam(url, 'imdb_id', movie.imdb_id || '');
            url = addParam(url, 'tmdb_id', movie.id || '');
            url = addParam(url, 'year', getYear(movie));
            url = addParam(url, 'serial', isSerial(movie));

            getJson(url, function (json) {
                if (!json || !json.ok || !json.items || !json.items.length) {
                    _this.showEmpty();
                    return;
                }

                if (json.items.length === 1) {
                    _this.loadContent(json.items[0].ref);
                    return;
                }

                // Показать выбор
                _this.activity.loader(false);
                _this.activity.toggle();
                _this.drawSimilars(json.items);

            }, function () {
                _this.showEmpty();
            });
        };

        this.drawSimilars = function (items) {
            var _this = this;

            items.forEach(function (item) {
                var title = item.title || item.name || '';
                var orig = item.title_en || item.original_title || '';
                var year = item.year || '';
                var info = [year, orig].filter(Boolean).join(' / ');

                var posterHtml = item.poster
                    ? '<div style="width:4em;height:5.5em;flex-shrink:0;margin-right:1em;border-radius:0.2em;overflow:hidden;background:#111">' +
                      '<img src="' + escapeHtml(item.poster) + '" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display=\'none\'">' +
                      '</div>'
                    : '';

                var el = $('<div class="selector" style="padding:0.4em 0">' +
                    '<div style="display:flex;align-items:center;padding:0.7em 1em;background:rgba(255,255,255,0.06);border-radius:0.3em">' +
                    posterHtml +
                    '<div><div style="font-size:1.3em;color:white">' + escapeHtml(title) + '</div>' +
                    (info ? '<div style="font-size:0.9em;opacity:0.5;margin-top:0.2em">' + escapeHtml(info) + '</div>' : '') +
                    '</div></div></div>');

                el.on('hover:enter', function () {
                    _this.activity.loader(true);
                    _this.reset();
                    _this.loadContent(item.ref);
                }).on('hover:focus', function (e) {
                    last = e.target;
                    scroll.update($(e.target), true);
                });

                scroll.append(el);
            });

            Lampa.Controller.enable('content');
        };

        this.loadContent = function (ref) {
            var _this = this;

            postJson(API + '/content', { source: SOURCE, ref: ref, full: true }, function (json) {
                if (!json || !json.ok) {
                    _this.showEmpty();
                    return;
                }

                if (json.type === 'series') {
                    series = json;
                    _this.setupFilter();
                    _this.buildEpisodes();
                } else {
                    _this.drawMovie(json);
                }
            }, function () {
                _this.showEmpty();
            });
        };

        this.setupFilter = function () {
            if (!series || !series.voices) return;

            var voiceNames = series.voices.map(function (v) {
                return v.display_name || v.name || v.id || 'Voice';
            });

            var voice = series.voices[choice.voice] || series.voices[0];
            var seasons = (voice && voice.seasons || []).map(function (s, i) {
                var num = (s.title || s.season || s.number || '').toString().match(/(\d+)/);
                return 'Сезон ' + (num ? num[1] : (i + 1));
            });

            if (choice.voice >= voiceNames.length) choice.voice = 0;
            if (choice.season >= seasons.length) choice.season = 0;

            var select = [];
            select.push({ title: 'Скинути', reset: true });
            if (voiceNames.length) {
                select.push({
                    title: 'Озвучка',
                    subtitle: voiceNames[choice.voice],
                    items: voiceNames.map(function (n, i) { return { title: n, selected: i === choice.voice, index: i }; }),
                    stype: 'voice'
                });
            }
            if (seasons.length) {
                select.push({
                    title: 'Сезон',
                    subtitle: seasons[choice.season],
                    items: seasons.map(function (n, i) { return { title: n, selected: i === choice.season, index: i }; }),
                    stype: 'season'
                });
            }

            filter.set('filter', select);
            filter.chosen('filter', [voiceNames[choice.voice], seasons[choice.season]].filter(Boolean));
        };

        this.buildEpisodes = function () {
            var _this = this;

            if (!series || !series.voices || !series.voices.length) {
                _this.showEmpty();
                return;
            }

            var voice = series.voices[choice.voice] || series.voices[0];
            if (!voice || !voice.seasons) { _this.showEmpty(); return; }

            var season = voice.seasons[choice.season] || voice.seasons[0];
            if (!season || !season.episodes || !season.episodes.length) { _this.showEmpty(); return; }

            _this.activity.loader(false);
            _this.activity.toggle();

            season.episodes.forEach(function (ep, idx) {
                var num = ep.number || ep.episode || (idx + 1);
                var title = ep.title || ep.name || ('Серія ' + num);

                var el = $('<div class="selector" style="padding:0.4em 0">' +
                    '<div style="padding:0.7em 1em;background:rgba(255,255,255,0.06);border-radius:0.3em">' +
                    '<div style="font-size:1.2em;color:white">' + escapeHtml(title) + '</div>' +
                    '<div style="font-size:0.85em;opacity:0.5;margin-top:0.2em">' + escapeHtml(voice.display_name || voice.name || '') + '</div>' +
                    '</div></div>');

                el.on('hover:enter', function () {
                    _this.getStream(ep.ref, title);
                }).on('hover:focus', function (e) {
                    last = e.target;
                    scroll.update($(e.target), true);
                });

                scroll.append(el);
            });

            Lampa.Controller.enable('content');
        };

        this.drawMovie = function (json) {
            var _this = this;
            var streams = json.streams || [];

            _this.activity.loader(false);
            _this.activity.toggle();

            if (!streams.length && json.voices) {
                json.voices.forEach(function (v) {
                    var label = v.display_name || v.name || 'Дивитись';
                    var el = $('<div class="selector" style="padding:0.4em 0"><div style="padding:0.7em 1em;background:rgba(255,255,255,0.06);border-radius:0.3em"><div style="font-size:1.3em;color:white">' + escapeHtml(label) + '</div></div></div>');
                    el.on('hover:enter', function () {
                        var ref = v.stream_ref || v.ref;
                        if (ref) _this.getStream(ref, label);
                        else if (v.streams && v.streams[0] && v.streams[0].url) {
                            _this.playUrl(v.streams[0].url, label, v.streams);
                        }
                    }).on('hover:focus', function (e) { last = e.target; scroll.update($(e.target), true); });
                    scroll.append(el);
                });
                Lampa.Controller.enable('content');
                return;
            }

            streams.forEach(function (s, i) {
                if (s.url) {
                    _this.playUrl(s.url, object.movie.title || 'UAFlix', streams);
                    return;
                }
                if (s.ref) {
                    _this.getStream(s.ref, s.title || 'Дивитись');
                }
            });
        };

        this.getStream = function (ref, title) {
            var _this = this;
            _this.activity.loader(true);

            postJson(API + '/stream', { source: SOURCE, ref: ref }, function (json) {
                _this.activity.loader(false);

                if (!json || !json.ok || !json.streams || !json.streams.length) {
                    Lampa.Noty.show('Потік не знайдено');
                    return;
                }

                var qualities = {};
                json.streams.forEach(function (s) {
                    var label = s.title || s.quality || 'auto';
                    if (s.url) qualities[label] = proxyStream(s.url);
                });

                if (!Object.keys(qualities).length) {
                    Lampa.Noty.show('Потік не знайдено');
                    return;
                }

                var keys = Object.keys(qualities);
                Lampa.Player.play({
                    title: title || 'UAFlix',
                    url: qualities[keys[0]],
                    quality: qualities
                });
                Lampa.Player.playlist([]);

            }, function () {
                _this.activity.loader(false);
                Lampa.Noty.show('Помилка отримання потоку');
            });
        };

        this.playUrl = function (url, title, streams) {
            var qualities = {};
            (streams || []).forEach(function (s) {
                var label = s.title || s.quality || 'auto';
                if (s.url) qualities[label] = proxyStream(s.url);
            });
            if (!Object.keys(qualities).length) qualities['auto'] = proxyStream(url);

            Lampa.Player.play({
                title: title || 'UAFlix',
                url: proxyStream(url),
                quality: qualities
            });
            Lampa.Player.playlist([]);
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

    // ============ REGISTER ============

    Lampa.Component.add(PLUGIN_NAME, uafixComponent);

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

    console.log('[UAFlix] Plugin loaded (API mode)');
})();
