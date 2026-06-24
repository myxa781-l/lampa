// UaFlix Lampa Plugin — uafix.net
// Based on LME.Uaflix C# module

(function () {
    'use strict';

    var PLUGIN_ID   = 'uaflix';
    var PLUGIN_NAME = 'UaFlix';
    var HOST        = 'https://uafix.net';

    // ─── Network ──────────────────────────────────────────────────────────────

    function get(url, headers, callback, fail) {
        var network = new Lampa.Reguest();
        network.timeout(15000);
        network.silent(url, callback, fail || function(){}, headers || {});
    }

    function getHtml(url, callback, fail) {
        get(url, { 'User-Agent': 'Mozilla/5.0', 'Referer': HOST }, callback, fail || function(){});
    }

    // ─── HTML Helpers ─────────────────────────────────────────────────────────

    function parseDoc(html) {
        var p = new DOMParser();
        return p.parseFromString(html, 'text/html');
    }

    function decHtml(s) {
        var d = document.createElement('div');
        d.innerHTML = s;
        return d.textContent || '';
    }

    function toAbs(url) {
        if (!url) return '';
        url = decHtml(url.trim()).replace(/&amp;/g, '&');
        if (/^\/\//.test(url)) return 'https:' + url;
        if (/^https?:\/\//.test(url)) return url;
        return HOST + '/' + url.replace(/^\//, '');
    }

    function normIframe(url) {
        if (!url) return null;
        url = decHtml(url.trim()).replace(/&amp;/g, '&');
        if (/^\/\//.test(url)) return 'https:' + url;
        return url;
    }

    function extractYear(text) {
        if (!text) return 0;
        var m = ('' + text).match(/(19|20)\d{2}/);
        return m ? parseInt(m[0], 10) : 0;
    }

    function playerType(url) {
        if (!url) return null;
        var u = url.toLowerCase();
        if (u.indexOf('ashdi.vip/serial/') >= 0) return 'ashdi-serial';
        if (u.indexOf('ashdi.vip/vod/')    >= 0) return 'ashdi-vod';
        if (u.indexOf('zetvideo.net/serial/') >= 0) return 'zetvideo-serial';
        if (u.indexOf('zetvideo.net/vod/')   >= 0) return 'zetvideo-vod';
        if (u.indexOf('youtube.com/embed/')  >= 0) return 'trailer';
        return null;
    }

    function allIframes(doc) {
        var seen = {};
        var out  = [];
        var nodes = doc.querySelectorAll('.video-box iframe, iframe');
        nodes.forEach(function(n) {
            var src = normIframe(n.getAttribute('src'));
            if (src && !seen[src.toLowerCase()]) { seen[src.toLowerCase()] = 1; out.push(src); }
        });
        var meta = doc.querySelector("meta[property='og:video:iframe']");
        if (meta) {
            var c  = meta.getAttribute('content') || '';
            var m2 = c.match(/src=['"]([^'"]+)['"]/i);
            if (m2) {
                var u2 = normIframe(m2[1]);
                if (u2 && !seen[u2.toLowerCase()]) out.push(u2);
            }
        }
        return out;
    }

    // ─── Search ───────────────────────────────────────────────────────────────

    function search(queries, callback) {
        var results = {};
        var idx = 0;

        function next() {
            if (idx >= queries.length) { callback(Object.values(results)); return; }
            var q   = queries[idx++];
            var url = HOST + '/index.php?do=search&subaction=search&story=' + encodeURIComponent(q);

            getHtml(url, function(html) {
                var doc   = parseDoc(html);
                var items = doc.querySelectorAll('a.sres-wrap');
                items.forEach(function(node) {
                    var href = node.getAttribute('href');
                    if (!href) return;
                    var filmUrl = toAbs(href);
                    if (results[filmUrl]) return;

                    var h = node.querySelector('h2, h3');
                    if (!h) return;

                    var descNode   = node.querySelector('.sres-desc, .year');
                    var posterNode = node.querySelector('img[src], img[data-src]');
                    var poster     = posterNode ? (posterNode.getAttribute('src') || posterNode.getAttribute('data-src') || '') : '';
                    if (poster && !/^https?:\/\//.test(poster)) poster = HOST + poster;

                    var catM     = filmUrl.match(/uafix\.net\/(film|serial|anime)\//i);
                    var category = catM ? catM[1].toLowerCase() : '';

                    results[filmUrl] = {
                        title:    decHtml((h.textContent || '').trim()),
                        url:      filmUrl,
                        year:     extractYear(descNode ? descNode.textContent : ''),
                        poster:   poster,
                        category: category
                    };
                });
                next();
            }, function() { next(); });
        }

        next();
    }

    function score(r, title, origTitle, year, isSerial) {
        var s  = 0;
        var cl = (r.title || '').toLowerCase();
        var tl = (title    || '').toLowerCase();
        var ol = (origTitle|| '').toLowerCase();

        if (cl === tl || cl === ol)                             s += 100;
        else if (cl.indexOf(tl) >= 0 || (ol && cl.indexOf(ol) >= 0)) s += 50;

        if (year > 0) {
            if (r.year === year)                          s += 60;
            else if (r.year > 0 && Math.abs(r.year - year) === 1) s += 10;
            else if (r.year > 0)                         s -= 15;
        }

        var expectedCat = isSerial ? 'serial' : 'film';
        if (r.category === expectedCat)                   s += 25;
        else if (r.category && r.category !== expectedCat) s -= 10;

        return s;
    }

    // ─── Season index ─────────────────────────────────────────────────────────

    function seasonIndex(serialUrl, callback) {
        getHtml(serialUrl, function(html) {
            var doc   = parseDoc(html);
            var nodes = doc.querySelectorAll('.sez-wr a, .fss-box a');
            var seasons = {};

            if (!nodes.length) { seasons[1] = serialUrl; callback(seasons); return; }

            nodes.forEach(function(node) {
                var href = node.getAttribute('href');
                var url  = toAbs(href);
                var text = node.textContent || '';
                var m = url.match(/sezon[-_\/]?(\d+)/i)
                     || url.match(/season[-_\/]?(\d+)/i)
                     || text.match(/сезон\s*(\d+)/i)
                     || text.match(/season\s*(\d+)/i);
                if (m) {
                    var sn = parseInt(m[1], 10);
                    if (!seasons[sn]) seasons[sn] = url;
                }
            });

            if (!Object.keys(seasons).length) seasons[1] = serialUrl;
            callback(seasons);
        }, function() { callback({ 1: serialUrl }); });
    }

    function seasonEpisodes(seasonUrl, seasonNum, callback) {
        getHtml(seasonUrl, function(html) {
            var doc    = parseDoc(html);
            var nodes  = doc.querySelectorAll('.frels a.vi-img');
            var out    = [];
            var used   = {};
            var fbEp   = 1;

            nodes.forEach(function(node) {
                var href  = node.getAttribute('href');
                var epUrl = toAbs(href);
                if (!epUrl || used[epUrl]) return;
                used[epUrl] = 1;

                var m    = epUrl.match(/season-(\d+).*?episode-(\d+)/i);
                var pSn  = seasonNum;
                var pEp  = fbEp;
                if (m) { pSn = parseInt(m[1],10); pEp = parseInt(m[2],10); }

                var viTn = node.querySelector('.vi-desc .vi-title, .vi-title');
                if (viTn && viTn.textContent.toLowerCase().indexOf("прем'єра") >= 0) return;

                if (pSn === seasonNum) {
                    var titleN = node.querySelector('.vi-rate');
                    out.push({ url: epUrl, title: (titleN ? titleN.textContent.trim() : '') || ('Епізод ' + pEp), season: pSn, episode: pEp });
                    fbEp = Math.max(fbEp, pEp + 1);
                }
            });

            out.sort(function(a,b){ return a.episode - b.episode; });
            callback(out);
        }, function(){ callback([]); });
    }

    // ─── Player parsers ───────────────────────────────────────────────────────

    function parseAshdiVod(iframeUrl, callback) {
        var url = iframeUrl + (iframeUrl.indexOf('?') >= 0 ? '&' : '?') + 'multivoice';
        get(url, { 'User-Agent': 'Mozilla/5.0', 'Referer': HOST }, function(html) {
            var streams = [];
            var m = html.match(/file:\s*'(\[.+?\])'/);
            if (m) {
                try {
                    var arr = JSON.parse(m[1].replace(/\\'/g,"'").replace(/\\"/g,'"'));
                    arr.forEach(function(item, i) {
                        if (!item.file) return;
                        streams.push({ link: item.file, title: item.title || ('Варіант '+(i+1)), subtitle: item.subtitle || '' });
                    });
                } catch(e) {}
            }
            if (!streams.length) {
                var fm = html.match(/file:\s*['"]?([^'"\s,}]+\.m3u8)['"]?/);
                if (fm) streams.push({ link: fm[1], title: 'Uaflix', subtitle: '' });
            }
            callback(streams);
        }, function(){ callback([]); });
    }

    function parseAshdiSerial(iframeUrl, callback) {
        var baseUrl = iframeUrl.replace(/\?.*$/, '');
        get(baseUrl, { 'User-Agent': 'Mozilla/5.0', 'Referer': HOST }, function(html) {
            var m = html.match(/file:'(\[.+?\])'/);
            if (!m) { callback([]); return; }
            try {
                var arr    = JSON.parse(m[1].replace(/\\'/g,"'").replace(/\\"/g,'"'));
                var voices = [];
                var counts = {};
                arr.forEach(function(vo) {
                    var vName = (vo.title || '').trim();
                    if (!vName) return;
                    var origName = vName;
                    if (counts[origName]) { counts[origName]++; vName = vName + ' ' + counts[origName]; }
                    else counts[origName] = 1;

                    var seasons = {};
                    (vo.folder || []).forEach(function(s) {
                        var sm = (s.title || '').match(/Сезон\s*(\d+)/i);
                        if (!sm) return;
                        var sn  = parseInt(sm[1], 10);
                        var eps = [];
                        var ep  = 1;
                        (s.folder || []).forEach(function(e) {
                            eps.push({ number: ep++, title: e.title, file: e.file, subtitle: e.subtitle || '' });
                        });
                        seasons[sn] = eps;
                    });
                    voices.push({ displayName: vName, playerType: 'ashdi-serial', seasons: seasons });
                });
                callback(voices);
            } catch(e) { callback([]); }
        }, function(){ callback([]); });
    }

    function parseZetvideo(iframeUrl, callback) {
        get(iframeUrl, { 'User-Agent': 'Mozilla/5.0', 'Referer': HOST }, function(html) {
            var m  = html.match(/file:\s*"([^"]+\.m3u8)"/);
            var sm = html.match(/subtitle:\s*"([^"]*)"/);
            if (!m) { callback([]); return; }
            callback([{ link: m[1], title: 'Uaflix', subtitle: (sm && sm[1]) || '' }]);
        }, function(){ callback([]); });
    }

    // Probe a page and get streams — calls back with array of {link, title, subtitle}
    function probePage(url, callback) {
        getHtml(url, function(html) {
            var doc = parseDoc(html);

            // direct <video>
            var video = doc.querySelector('video[src]');
            if (video) { callback([{ link: video.getAttribute('src'), title: 'Uaflix', subtitle: '' }]); return; }

            var iframes = allIframes(doc);
            var zetIframes = iframes.filter(function(u){ return u && u.indexOf('zetvideo.net') >= 0; });

            if (zetIframes.length) {
                var streams = [];
                var left    = zetIframes.length;
                zetIframes.forEach(function(zi, idx) {
                    parseZetvideo(zi, function(s) {
                        s.forEach(function(st){ st.title = idx === 0 ? 'Uaflix' : 'Оригінал'; });
                        streams = streams.concat(s);
                        if (--left === 0) callback(streams);
                    });
                });
                return;
            }

            var firstIframe = iframes[0];
            var pt          = playerType(firstIframe);

            if (pt === 'ashdi-vod') { parseAshdiVod(firstIframe, callback); return; }
            if (pt === 'zetvideo-vod') { parseZetvideo(firstIframe, callback); return; }
            if (pt === 'trailer' || !firstIframe) { callback([]); return; }

            // ashdi-serial as film — treat VOD
            if (pt === 'ashdi-serial') {
                var withMv = firstIframe + (firstIframe.indexOf('?') >= 0 ? '&' : '?') + 'multivoice';
                get(withMv, { 'User-Agent': 'Mozilla/5.0', 'Referer': HOST }, function(html2) {
                    var fm = html2.match(/file:\s*['"]?([^'"\s,}]+\.m3u8)['"]?/);
                    callback(fm ? [{ link: fm[1], title: 'Uaflix', subtitle: '' }] : []);
                }, function(){ callback([]); });
                return;
            }

            callback([]);
        }, function(){ callback([]); });
    }

    // ─── Lampa component ──────────────────────────────────────────────────────

    function UaflixComponent(object) {
        var comp    = this;
        var scroll  = new Lampa.Scroll({ mask: true, over: true });
        var files   = new Lampa.Explorer(object);
        var network = new Lampa.Reguest();

        var movie    = object.movie;
        var isSerial = !!(movie.number_of_seasons || (movie.genre_ids && movie.genre_ids.indexOf(10766) >= 0));
        var title    = movie.title || movie.name || '';
        var origTitle= movie.original_title || movie.original_name || '';
        var year     = movie.release_date ? parseInt(('' + movie.release_date).substr(0, 4), 10) : 0;

        // state
        var currentSeason   = null;
        var currentVoice    = null;
        var foundSerialUrl  = null;
        var foundVoices     = [];

        scroll.body().addClass('torrent-list');
        files.appendFiles(scroll.render());

        // ── Helpers ─────────────────────────────────────────────────────────

        function loading(state) { comp.activity.loader(state); }

        function showEmpty(msg) {
            var empty = Lampa.Template.get('list_empty');
            if (msg) empty.find('.empty__descr').text(msg);
            scroll.append(empty);
            loading(false);
            comp.start();
        }

        function mkItem(params) {
            // params: { title, subtitle?, onclick }
            var html = Lampa.Template.get('online_mod', {
                title:   params.title   || '',
                quality: params.subtitle || '',
                info:    ''
            });
            html.addClass('selector');
            html.on('hover:enter', params.onclick);
            html.on('hover:focus', function(e) { scroll.update($(e.target), true); });
            scroll.append(html);
        }

        // ── Render streams list (film) ───────────────────────────────────────

        function renderStreams(streams) {
            streams.forEach(function(s) {
                mkItem({
                    title:    s.title || 'Uaflix',
                    subtitle: '',
                    onclick: function() {
                        Lampa.Player.play({
                            url:      s.link,
                            title:    title + (s.title ? ' [' + s.title + ']' : ''),
                            timeline: Lampa.Timeline.data(object)
                        });
                        Lampa.Player.playlist([{ url: s.link, title: s.title || 'Uaflix' }]);
                    }
                });
            });
            loading(false);
            comp.start(true);
        }

        // ── Render season list ───────────────────────────────────────────────

        function renderSeasons(seasons) {
            var nums = Object.keys(seasons).map(Number).sort(function(a,b){ return a-b; });
            nums.forEach(function(sn) {
                mkItem({
                    title: 'Сезон ' + sn,
                    onclick: function() {
                        currentSeason = sn;
                        scroll.render().find('.torrent-list').empty();
                        scroll.clear();
                        loading(true);
                        loadSeason(seasons[sn], sn);
                    }
                });
            });
            loading(false);
            comp.start(true);
        }

        // ── Render episodes (VOD-type) ───────────────────────────────────────

        function renderEpisodes(episodes) {
            episodes.forEach(function(ep) {
                mkItem({
                    title: ep.title || ('Епізод ' + ep.episode),
                    onclick: function() {
                        loading(true);
                        probePage(ep.url, function(streams) {
                            loading(false);
                            if (!streams.length) { Lampa.Noty.show('Потік не знайдено'); return; }
                            var s = streams[0];
                            Lampa.Player.play({
                                url:   s.link,
                                title: title + ' S' + ep.season + 'E' + ep.episode,
                                timeline: Lampa.Timeline.data(object)
                            });
                        });
                    }
                });
            });
            loading(false);
            comp.start(true);
        }

        // ── Render voices + episodes (ashdi/zetvideo-serial) ─────────────────

        function renderVoicedEpisodes(voices, activeVoiceName, seasonNum) {
            var voice = voices.find(function(v){ return v.displayName === activeVoiceName; });
            if (!voice) { showEmpty('Озвучку не знайдено'); return; }

            var episodes = (voice.seasons[seasonNum] || []);
            if (!episodes.length) { showEmpty('Епізоди відсутні'); return; }

            // Voice switcher as first item
            if (voices.length > 1) {
                voices.forEach(function(v) {
                    var isActive = v.displayName === activeVoiceName;
                    var html = Lampa.Template.get('online_mod', {
                        title:   (isActive ? '▶ ' : '') + v.displayName,
                        quality: 'Озвучка',
                        info:    ''
                    });
                    html.addClass('selector');
                    if (isActive) html.addClass('focus');
                    html.on('hover:enter', (function(vn) {
                        return function() {
                            currentVoice = vn;
                            scroll.clear();
                            renderVoicedEpisodes(voices, vn, seasonNum);
                        };
                    })(v.displayName));
                    html.on('hover:focus', function(e){ scroll.update($(e.target), true); });
                    scroll.append(html);
                });
            }

            // Episodes
            episodes.forEach(function(ep) {
                mkItem({
                    title: ep.title || ('Епізод ' + ep.number),
                    onclick: function() {
                        var ptype = voice.playerType;
                        if (ptype === 'ashdi-vod' || ptype === 'zetvideo-vod') {
                            // ep.file is page URL for VOD
                            loading(true);
                            probePage(ep.file, function(streams) {
                                loading(false);
                                if (!streams.length) { Lampa.Noty.show('Потік не знайдено'); return; }
                                var s = streams.find(function(st){ return st.title === activeVoiceName; }) || streams[0];
                                playEp(s.link, s.subtitle, ep, seasonNum);
                            });
                        } else {
                            // Direct HLS link
                            playEp(ep.file, ep.subtitle, ep, seasonNum);
                        }
                    }
                });
            });

            loading(false);
            comp.start(true);
        }

        function playEp(url, subtitle, ep, sn) {
            var data = {
                url:      url,
                title:    title + ' — S' + (sn||'') + 'E' + (ep.number||ep.episode||''),
                timeline: Lampa.Timeline.data(object)
            };
            Lampa.Player.play(data);
            Lampa.Player.playlist([data]);
        }

        // ── Load season ──────────────────────────────────────────────────────

        function loadSeason(seasonUrl, seasonNum) {
            seasonEpisodes(seasonUrl, seasonNum, function(episodes) {
                if (!episodes.length) { showEmpty('Епізоди не знайдено'); return; }

                // Probe first episode to find player type
                var firstEp = episodes[0];
                getHtml(firstEp.url, function(html) {
                    var doc      = parseDoc(html);
                    var iframes  = allIframes(doc);
                    var first    = iframes[0];
                    var pt       = playerType(first);

                    if (pt === 'ashdi-serial' || pt === 'zetvideo-serial') {
                        var parser = (pt === 'ashdi-serial') ? parseAshdiSerial : parseAshdiSerial;
                        parser(first, function(voices) {
                            foundVoices = voices;
                            if (!voices.length) { showEmpty('Голоси не знайдено'); return; }
                            if (!currentVoice) currentVoice = voices[0].displayName;
                            renderVoicedEpisodes(voices, currentVoice, seasonNum);
                        });
                    } else {
                        // VOD-type or unknown — list episodes by page
                        renderEpisodes(episodes);
                    }
                }, function() { renderEpisodes(episodes); });
            });
        }

        // ── create ───────────────────────────────────────────────────────────

        this.create = function() {
            loading(true);

            var queries = [];
            if (origTitle && origTitle !== title) queries.push(origTitle);
            if (title) queries.push(title);
            if (!queries.length) { showEmpty('Немає назви'); return; }

            search(queries, function(results) {
                if (!results.length) { showEmpty('Не знайдено'); return; }

                results.forEach(function(r) { r._score = score(r, title, origTitle, year, isSerial); });
                results.sort(function(a,b){ return b._score - a._score; });

                var best = results[0];

                if (isSerial) {
                    foundSerialUrl = best.url;
                    seasonIndex(best.url, function(seasons) {
                        var nums = Object.keys(seasons).map(Number).sort(function(a,b){ return a-b; });
                        if (!nums.length) { showEmpty('Сезони не знайдено'); return; }
                        if (nums.length === 1) {
                            currentSeason = nums[0];
                            loadSeason(seasons[nums[0]], nums[0]);
                        } else {
                            renderSeasons(seasons);
                        }
                    });
                } else {
                    probePage(best.url, function(streams) {
                        if (!streams.length) { showEmpty('Потоки не знайдено'); return; }
                        renderStreams(streams);
                    });
                }
            });

            return this.render();
        };

        this.render = function() {
            return files.render();
        };

        this.start = function(first_select) {
            if (Lampa.Activity.active().activity !== this.activity) return;

            Lampa.Background.immediately(Lampa.Utils.cardImgBackground(movie));
            Lampa.Controller.add('content', {
                toggle: function() {
                    Lampa.Controller.collectionSet(scroll.render(), files.render());
                    Lampa.Controller.collectionFocus(false, scroll.render());
                },
                up:   function() { if (Navigator.canmove('up')) Navigator.move('up'); else Lampa.Controller.toggle('head'); },
                down: function() { Navigator.move('down'); },
                left: function() { if (Navigator.canmove('left')) Navigator.move('left'); else Lampa.Controller.toggle('menu'); },
                right:function() { Navigator.move('right'); },
                back: comp.back
            });
            if (this.inActivity()) Lampa.Controller.toggle('content');
        };

        this.back = function() { Lampa.Activity.backward(); };
        this.pause   = function(){};
        this.stop    = function(){};
        this.destroy = function() { network.clear(); files.destroy(); scroll.destroy(); };
    }

    // ─── Template fallback ────────────────────────────────────────────────────
    // If online_mod template isn't available, register a minimal one
    function ensureTemplate() {
        if (!Lampa.Template.get('online_mod', {}, true)) {
            Lampa.Template.add('online_mod', '<div class="uaflix-item selector">' +
                '<div class="online__info"><div class="online__title">{title}</div>' +
                '<div class="online__quality">{quality}</div></div></div>');
        }
    }

    // ─── Plugin init ──────────────────────────────────────────────────────────

    function startPlugin() {
        ensureTemplate();
        Lampa.Component.add(PLUGIN_ID, UaflixComponent);

        var ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">' +
            '<path fill="currentColor" d="M8 5v14l11-7z"/></svg>';

        var button = $('<div class="full-start__button selector view--uaflix" style="margin-top:.3em">' +
            ICON + '<span>' + PLUGIN_NAME + '</span></div>');

        Lampa.Listener.follow('full', function(e) {
            if (e.type !== 'complite') return;

            var btn = button.clone();
            btn.on('hover:enter', function() {
                Lampa.Component.add(PLUGIN_ID, UaflixComponent);
                Lampa.Activity.push({
                    url:      '',
                    title:    PLUGIN_NAME,
                    component: PLUGIN_ID,
                    movie:    e.data.movie,
                    page:     1
                });
            });

            // Insert after torrent button if exists, otherwise append
            var torrentBtn = e.object.activity.render().find('.view--torrent');
            if (torrentBtn.length) torrentBtn.after(btn);
            else e.object.activity.render().find('.full-start__buttons').append(btn);
        });
    }

    if (window.appready) startPlugin();
    else Lampa.Listener.follow('app', function(e) {
        if (e.type === 'ready') startPlugin();
    });

})();
