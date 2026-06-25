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

    function formatEp(num) {
        return (num < 10 ? '0' : '') + num;
    }

    // ============ SEARCH COMPONENT ============

    function uafixComponent(object) {
        var network = new Lampa.Reguest();
        var scroll  = new Lampa.Scroll({ mask: true, over: true });
        var files   = new Lampa.Explorer(object);
        var filter  = new Lampa.Filter(object);
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
                files.appendHead(filter.render());
                scroll.body().addClass('torrent-list');
                scroll.minus(files.render().find('.explorer__files-head'));

                filter.onBack = function () { _this.start(); };
                filter.onSearch = function (value) {
                    Lampa.Activity.replace({ search: value, clarification: true });
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
                        if (link.indexOf('http') !== 0) link = UAFIX + link;
                        if (poster && poster.indexOf('http') !== 0) poster = UAFIX + poster;
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
                    var a = el.querySelector('a');
                    var titleEl = el.querySelector('.vi-title');
                    var img = el.querySelector('img');

                    if (!a) return;
                    var href = a.getAttribute('href') || '';
                    if (!href || seenEp[href]) return;
                    seenEp[href] = true;

                    var titleText = titleEl ? titleEl.textContent.trim() : '';
                    var thumb = img ? (img.getAttribute('data-src') || img.getAttribute('src') || '') : '';
                    if (thumb && thumb.indexOf('http') !== 0) thumb = UAFIX + thumb;
                    if (href.indexOf('http') !== 0) href = UAFIX + href;

                    // Извлекаем номер серии
                    var epMatch = href.match(/episode-?(\d+)/i);
                    var epNum = epMatch ? parseInt(epMatch[1]) : episodes.length + 1;

                    episodes.push({
                        title: titleText || ('Серія ' + epNum),
                        url: href,
                        poster: thumb,
                        episode: epNum
                    });
                });

                // Fallback: ссылки с episode
                if (!episodes.length) {
                    doc.querySelectorAll('a[href*="episode"]').forEach(function (a) {
                        var href = a.getAttribute('href') || '';
                        if (!href || href === '#' || seenEp[href]) return;
                        seenEp[href] = true;
                        if (href.indexOf('http') !== 0) href = UAFIX + href;
                        var epMatch = href.match(/episode-?(\d+)/i);
                        var epNum = epMatch ? parseInt(epMatch[1]) : episodes.length + 1;
                        episodes.push({
                            title: a.textContent.trim() || ('Серія ' + epNum),
                            url: href, poster: '', episode: epNum
                        });
                    });
                }

                if (episodes.length) {
                    // Сортировка: от первой к последней
                    episodes.sort(function (a, b) { return a.episode - b.episode; });
                    _this.showEpisodes(episodes);
                    return;
                }

                // 2) Сезоны
                var seasons = [];
                var seenS = {};
                doc.querySelectorAll('a[href*="/sezon-"]').forEach(function (a) {
                    var href = a.getAttribute('href') || '';
                    if (!href || href === '#' || seenS[href]) return;
                    if (href.match(/episode/i)) return;
                    seenS[href] = true;
                    if (href.indexOf('http') !== 0) href = UAFIX + href;
                    var sMatch = href.match(/sezon-?(\d+)/i);
                    var sNum = sMatch ? parseInt(sMatch[1]) : seasons.length + 1;
                    seasons.push({
                        title: a.textContent.trim() || ('Сезон ' + sNum),
                        url: href,
                        number: sNum
                    });
                });

                if (seasons.length) {
                    seasons.sort(function (a, b) { return a.number - b.number; });
                    _this.showSeasons(seasons);
                    return;
                }

                // 3) Плеер — табы или iframe
                var players = [];
                var tabs = doc.querySelectorAll('.tabs-sel .tabs-link');
                var contents = doc.querySelectorAll('.tabs-b.video-box');
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

                if (players.length > 1) { _this.showPlayers(players); return; }
                if (players.length === 1) {
                    _this.activity.loader(false);
                    _this.resolveIframe(players[0].src, object.page_title || 'UAFlix');
                    return;
                }

                // 4) vod в HTML
                var vodMatch = text.match(/zetvideo\.net\/vod\/(\d+)/);
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

            var serial = object.movie.name ? true : false;

            episodes.forEach(function (ep) {
                var epLabel = '<div class="online-prestige__episode-number" style="position:absolute;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;font-size:2em;color:white">' + formatEp(ep.episode) + '</div>';

                var imgHtml = ep.poster
                    ? '<img src="' + escapeHtml(ep.poster) + '" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;border-radius:0.3em" onerror="this.style.display=\'none\'">'
                    : '';

                var html = $('<div class="online-prestige online-prestige--full selector" style="display:flex;border-radius:0.3em;background:rgba(0,0,0,0.3);margin-bottom:1em">' +
                    '<div style="position:relative;width:13em;min-height:8em;flex-shrink:0">' +
                    imgHtml + epLabel +
                    '</div>' +
                    '<div style="padding:1.2em;flex-grow:1">' +
                    '<div style="font-size:1.5em;color:white;margin-bottom:0.3em">' + escapeHtml(ep.title) + '</div>' +
                    '</div>' +
                    '</div>');

                html.on('hover:enter', function () {
                    _this.loadEpisode(ep.url, ep.title);
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
                // Ищем vod ID в HTML
                var vodMatch = text.match(/zetvideo\.net\/vod\/(\d+)/);
                if (vodMatch) {
                    _this.activity.loader(false);
                    _this.resolveVod(vodMatch[1], title);
                    return;
                }

                // Fallback: iframe
                var doc = parseHTML(text);
                var iframeSrc = '';
                var contents = doc.querySelectorAll('.tabs-b.video-box');
                if (contents.length > 0) {
                    for (var i = 0; i < contents.length; i++) {
                        var iframe = contents[i].querySelector('iframe');
                        if (iframe) {
                            iframeSrc = iframe.getAttribute('src') || iframe.getAttribute('data-src') || '';
                            if (iframeSrc.indexOf('zetvideo') !== -1) break;
                        }
                    }
                }

                if (!iframeSrc) {
                    var iframeEl = doc.querySelector('iframe[src*="zet"]') || doc.querySelector('.video-box iframe') || doc.querySelector('iframe');
                    if (iframeEl) iframeSrc = iframeEl.getAttribute('src') || iframeEl.getAttribute('data-src') || '';
                }

                if (iframeSrc && iframeSrc.indexOf('youtube') === -1) {
                    _this.activity.loader(false);
                    _this.resolveIframe(iframeSrc, title);
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

                var fileMatch = html.match(/file:"([^"]+\.m3u8[^"]*)"/);
                if (fileMatch) { _this.playMaster(fileMatch[1], title); return; }

                var rawMatch = html.match(/https?:\/\/[^\s"']+\.m3u8/);
                if (rawMatch) { _this.playMaster(rawMatch[0], title); return; }

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

                var fileMatch = html.match(/file:"([^"]+\.m3u8[^"]*)"/);
                if (fileMatch) { _this.playMaster(fileMatch[1], title); return; }

                var m = html.match(/https?:\/\/zetvideo\.net\/vid\/[^"'\s]+\.m3u8/);
                if (m) { _this.playMaster(m[0], title); return; }

                Lampa.Noty.show('Потік не знайдено');
            }, function () {
                _this.activity.loader(false);
                Lampa.Noty.show('Помилка ZetVideo');
            });
        };

        this.playMaster = function (masterUrl, title) {
            var _this = this;
            _this.activity.loader(true);

            getRequest(masterUrl, function (text) {
                _this.activity.loader(false);

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

                if (!Object.keys(qualities).length) qualities['auto'] = masterUrl;

                // Сортировка: 1080p первым
                var sorted = Object.keys(qualities).sort(function (a, b) {
                    var na = parseInt(a) || 0;
                    var nb = parseInt(b) || 0;
                    return nb - na;
                });

                var best = sorted[0];
                var sortedQualities = {};
                sorted.forEach(function (k) { sortedQualities[k] = qualities[k]; });

                Lampa.Player.play({
                    title: title || 'UAFlix',
                    url: sortedQualities[best],
                    quality: sortedQualities
                });
                Lampa.Player.playlist([]);

            }, function () {
                // Fallback: играем мастер напрямую
                Lampa.Player.play({
                    title: title || 'UAFlix',
                    url: masterUrl,
                    quality: { auto: masterUrl }
                });
                Lampa.Player.playlist([]);
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

    console.log('[UAFlix] Plugin loaded (CF Worker proxy)');
})();
