(function () {
    'use strict';

    var PLUGIN_ID = 'uaflix';
    var PLUGIN_NAME = 'UaFlix';
    var DEFAULT_HOST = 'https://uafix.net';

    // ========================
    //  Helpers
    // ========================

    function request(url, opts) {
        opts = opts || {};
        return new Promise(function (resolve, reject) {
            Lampa.Reguest.native(url, function (data) {
                resolve(data || '');
            }, function (err) {
                reject(err);
            }, opts.headers || {}, opts.timeout || 15000);
        });
    }

    function parseDoc(html) {
        var parser = new DOMParser();
        return parser.parseFromString(html, 'text/html');
    }

    function toAbsUrl(url, host) {
        if (!url) return '';
        url = url.trim();
        if (/^\/\//.test(url)) return 'https:' + url;
        if (/^https?:\/\//.test(url)) return url;
        return (host || DEFAULT_HOST).replace(/\/$/, '') + '/' + url.replace(/^\//, '');
    }

    function extractYear(text) {
        if (!text) return 0;
        var m = text.match(/(19|20)\d{2}/);
        return m ? parseInt(m[0], 10) : 0;
    }

    function decodeHtml(html) {
        var d = document.createElement('div');
        d.innerHTML = html;
        return d.textContent || '';
    }

    function normalizeIframeUrl(url) {
        if (!url) return null;
        url = decodeHtml(url.trim()).replace(/&amp;/g, '&');
        if (/^\/\//.test(url)) url = 'https:' + url;
        return url;
    }

    function determinePlayerType(url) {
        if (!url) return null;
        var u = url.toLowerCase();
        if (u.includes('ashdi.vip/serial/')) return 'ashdi-serial';
        if (u.includes('ashdi.vip/vod/'))   return 'ashdi-vod';
        if (u.includes('zetvideo.net/serial/')) return 'zetvideo-serial';
        if (u.includes('zetvideo.net/vod/'))    return 'zetvideo-vod';
        if (u.includes('youtube.com/embed/') || u.includes('vimeo.com/')) return 'trailer';
        return null;
    }

    function extractAllIframes(doc, host) {
        var result = [];
        var nodes = doc.querySelectorAll('.video-box iframe, iframe');
        nodes.forEach(function (n) {
            var src = normalizeIframeUrl(n.getAttribute('src'));
            if (src && !result.some(function (u) { return u.toLowerCase() === src.toLowerCase(); }))
                result.push(src);
        });
        // og:video:iframe meta
        var meta = doc.querySelector('meta[property="og:video:iframe"]');
        if (meta) {
            var content = meta.getAttribute('content') || '';
            var m = content.match(/src=['"]([^'"]+)['"]/i);
            if (m) {
                var u = normalizeIframeUrl(m[1]);
                if (u && !result.some(function (x) { return x.toLowerCase() === u.toLowerCase(); }))
                    result.push(u);
            }
        }
        return result;
    }

    // ========================
    //  Settings / host
    // ========================

    function getHost() {
        return Lampa.Storage.get(PLUGIN_ID + '_host', DEFAULT_HOST).replace(/\/$/, '');
    }

    function getLang() {
        return Lampa.Storage.get(PLUGIN_ID + '_lang', 'uk');
    }

    // ========================
    //  Search
    // ========================

    function search(title, originalTitle, year) {
        var host = getHost();
        var queries = [];
        if (originalTitle && originalTitle !== title) queries.push(originalTitle);
        if (title) queries.push(title);
        queries = queries.filter(Boolean).filter(function (q, i, a) { return a.indexOf(q) === i; });

        var uniqueByUrl = {};

        function doQuery(q) {
            var url = host + '/index.php?do=search&subaction=search&story=' + encodeURIComponent(q);
            return request(url).then(function (html) {
                var doc = parseDoc(html);
                var items = doc.querySelectorAll('a.sres-wrap');
                items.forEach(function (node) {
                    var href = node.getAttribute('href');
                    if (!href) return;
                    var filmUrl = toAbsUrl(href, host);
                    if (uniqueByUrl[filmUrl]) return;

                    var h2 = node.querySelector('h2, h3');
                    if (!h2) return;

                    var filmTitle = decodeHtml(h2.textContent.trim());
                    var descNode = node.querySelector('.sres-desc, .year');
                    var filmYear = extractYear(descNode ? descNode.textContent : '');
                    var posterNode = node.querySelector('img[src], img[data-src]');
                    var poster = posterNode ? (posterNode.getAttribute('src') || posterNode.getAttribute('data-src') || '') : '';
                    if (poster && !/^https?:\/\//.test(poster)) poster = host + poster;

                    // category from url
                    var catMatch = filmUrl.match(/uafix\.net\/(film|serial|anime)\//i);
                    var category = catMatch ? catMatch[1].toLowerCase() : '';

                    uniqueByUrl[filmUrl] = { title: filmTitle, url: filmUrl, year: filmYear, poster: poster, category: category };
                });
            }).catch(function () {});
        }

        return queries.reduce(function (p, q) {
            return p.then(function () { return doQuery(q); });
        }, Promise.resolve()).then(function () {
            return Object.values(uniqueByUrl);
        });
    }

    // ========================
    //  Score / select best
    // ========================

    function scoreResult(r, title, originalTitle, year, isSerial) {
        var score = 0;
        var candidateLow = (r.title || '').toLowerCase();
        var titleLow = (title || '').toLowerCase();
        var origLow = (originalTitle || '').toLowerCase();

        if (candidateLow === titleLow || candidateLow === origLow) score += 100;
        else if (candidateLow.includes(titleLow) || (origLow && candidateLow.includes(origLow))) score += 60;

        if (year > 0) {
            if (r.year === year) score += 60;
            else if (r.year > 0 && Math.abs(r.year - year) === 1) score += 10;
            else if (r.year > 0) score -= 15;
        }

        var expectedCat = isSerial ? 'serial' : 'film';
        if (r.category === expectedCat) score += 25;
        else if (r.category && r.category !== expectedCat) score -= 10;

        return score;
    }

    // ========================
    //  Season/Episode index
    // ========================

    function getSeasonIndex(serialUrl) {
        var host = getHost();
        return request(serialUrl).then(function (html) {
            var doc = parseDoc(html);
            var seasonNodes = doc.querySelectorAll('.sez-wr a, .fss-box a');
            var seasons = {};

            if (!seasonNodes.length) {
                // single season
                seasons[1] = serialUrl;
                return seasons;
            }

            seasonNodes.forEach(function (node) {
                var href = node.getAttribute('href');
                var url = toAbsUrl(href, host);
                var text = node.textContent || '';
                var m = url.match(/sezon[-_\/]?(\d+)/i) || url.match(/season[-_\/]?(\d+)/i) ||
                        text.match(/сезон\s*(\d+)/i) || text.match(/season\s*(\d+)/i);
                if (m) {
                    var sn = parseInt(m[1], 10);
                    if (!seasons[sn]) seasons[sn] = url;
                }
            });

            return Object.keys(seasons).length ? seasons : { 1: serialUrl };
        });
    }

    function getSeasonEpisodes(seasonUrl, seasonNum, host) {
        return request(seasonUrl).then(function (html) {
            var doc = parseDoc(html);
            var epNodes = doc.querySelectorAll('.frels a.vi-img');
            var episodes = [];
            var used = {};
            var fallback = 1;

            epNodes.forEach(function (node) {
                var href = node.getAttribute('href');
                var epUrl = toAbsUrl(href, host);
                if (!epUrl || used[epUrl]) return;
                used[epUrl] = true;

                var m = epUrl.match(/season-(\d+).*?episode-(\d+)/i);
                var parsedSeason = seasonNum;
                var parsedEpisode = fallback;
                if (m) {
                    parsedSeason = parseInt(m[1], 10);
                    parsedEpisode = parseInt(m[2], 10);
                }

                var titleNode = node.querySelector('.vi-rate');
                var epTitle = titleNode ? titleNode.textContent.trim() : ('Епізод ' + parsedEpisode);

                // Check premiere
                var viTitle = node.querySelector('.vi-desc .vi-title, .vi-title');
                var isPremiere = viTitle && viTitle.textContent.toLowerCase().includes("прем'єра");

                if (parsedSeason === seasonNum && !isPremiere) {
                    episodes.push({ url: epUrl, title: epTitle, season: parsedSeason, episode: parsedEpisode });
                    fallback = Math.max(fallback, parsedEpisode + 1);
                }
            });

            episodes.sort(function (a, b) { return a.episode - b.episode; });
            return episodes;
        });
    }

    // ========================
    //  Player parsing
    // ========================

    function parseAshdiVod(iframeUrl) {
        var url = iframeUrl.includes('?') ? iframeUrl + '&multivoice' : iframeUrl + '?multivoice';
        return request(url, { headers: { 'Referer': 'https://uafix.net/' } }).then(function (html) {
            var streams = [];
            // Try JSON array  file: '[...]'
            var m = html.match(/file:\s*'(\[.+?\])'/s);
            if (m) {
                try {
                    var arr = JSON.parse(m[1].replace(/\\'/g, "'").replace(/\\"/g, '"'));
                    arr.forEach(function (item, i) {
                        var fileUrl = item.file || '';
                        if (!fileUrl) return;
                        streams.push({ link: fileUrl, title: item.title || ('Варіант ' + (i + 1)), quality: 'auto' });
                    });
                    if (streams.length) return streams;
                } catch (e) {}
            }
            // Fallback single m3u8
            var fm = html.match(/file:\s*['"]?([^'"\s,}]+\.m3u8)['"]?/);
            if (fm) streams.push({ link: fm[1], title: 'Uaflix', quality: 'auto' });
            return streams;
        }).catch(function () { return []; });
    }

    function parseAshdiSerial(iframeUrl) {
        // Strip params to get base serial URL
        var baseUrl = iframeUrl.replace(/\?.*$/, '');
        return request(baseUrl, { headers: { 'Referer': 'https://uafix.net/' } }).then(function (html) {
            var m = html.match(/file:'(\[.+?\])'/s);
            if (!m) return [];
            try {
                var arr = JSON.parse(m[1].replace(/\\'/g, "'").replace(/\\"/g, '"'));
                var voices = [];
                var voiceCounts = {};
                arr.forEach(function (voiceObj) {
                    var vName = (voiceObj.title || '').trim();
                    if (!vName) return;
                    if (voiceCounts[vName]) { voiceCounts[vName]++; vName = vName + ' ' + voiceCounts[vName]; }
                    else voiceCounts[(voiceObj.title || '').trim()] = 1;

                    var seasons = {};
                    (voiceObj.folder || []).forEach(function (seasonObj) {
                        var sm = (seasonObj.title || '').match(/Сезон\s*(\d+)/i);
                        if (!sm) return;
                        var sn = parseInt(sm[1], 10);
                        var episodes = [];
                        var ep = 1;
                        (seasonObj.folder || []).forEach(function (epObj) {
                            episodes.push({ number: ep++, title: epObj.title, file: epObj.file, subtitle: epObj.subtitle });
                        });
                        seasons[sn] = episodes;
                    });

                    voices.push({ displayName: vName, playerType: 'ashdi-serial', seasons: seasons });
                });
                return voices;
            } catch (e) { return []; }
        }).catch(function () { return []; });
    }

    function parseZetvideoVod(iframeUrl) {
        return request(iframeUrl, { headers: { 'Referer': 'https://uafix.net/' } }).then(function (html) {
            var streams = [];
            var m = html.match(/file:\s*"([^"]+\.m3u8)"/);
            if (!m) return streams;
            var subtitles = null;
            var sm = html.match(/subtitle:\s*"([^"]*)"/);
            if (sm && sm[1]) subtitles = sm[1];
            streams.push({ link: m[1], title: 'Uaflix', quality: '1080p', subtitle: subtitles });
            return streams;
        }).catch(function () { return []; });
    }

    function parseEpisodePage(epUrl, host) {
        return request(epUrl, { headers: { 'Referer': host } }).then(function (html) {
            var doc = parseDoc(html);

            // Direct video
            var video = doc.querySelector('video[src]');
            if (video) {
                return [{ link: video.getAttribute('src'), title: 'Uaflix', quality: '1080p' }];
            }

            var allIframes = extractAllIframes(doc, host);

            // zetvideo first
            var zetIframes = allIframes.filter(function (u) { return u && u.includes('zetvideo.net'); });
            if (zetIframes.length) {
                return Promise.all(zetIframes.map(function (u, idx) {
                    return parseZetvideoVod(u).then(function (streams) {
                        streams.forEach(function (s) { s.title = idx === 0 ? 'Uaflix' : 'Оригінал'; });
                        return streams;
                    });
                })).then(function (groups) {
                    return groups.reduce(function (a, b) { return a.concat(b); }, []);
                });
            }

            // ashdi
            var iframeUrl = allIframes[0];
            var playerType = iframeUrl ? determinePlayerType(iframeUrl) : null;

            if (playerType === 'ashdi-vod') return parseAshdiVod(iframeUrl);
            if (playerType === 'ashdi-serial') return []; // handled separately
            if (playerType === 'zetvideo-vod') return parseZetvideoVod(iframeUrl);

            return [];
        }).catch(function () { return []; });
    }

    // ========================
    //  Build Lampa component
    // ========================

    function UaflixComponent(object) {
        var comp = this;
        var host = getHost();
        comp.activity = object.activity;
        comp.data = {};
        comp.lang = getLang();

        var card = object.card;
        var isSerial = card.number_of_seasons > 0 || (card.genre_ids && card.genre_ids.includes(10766));
        var title = card.title || card.name || '';
        var origTitle = card.original_title || card.original_name || '';
        var year = card.release_date ? parseInt(card.release_date.substr(0, 4), 10) : 0;

        comp.create = function () {
            comp.activity.loader(true);

            search(title, origTitle, year).then(function (results) {
                if (!results || !results.length) {
                    comp.empty();
                    return;
                }

                // Score and pick
                results.forEach(function (r) { r._score = scoreResult(r, title, origTitle, year, isSerial); });
                results.sort(function (a, b) { return b._score - a._score; });

                var best = results[0];

                if (isSerial) {
                    comp.loadSerial(best.url);
                } else {
                    comp.loadFilm(best.url);
                }
            }).catch(function () {
                comp.error();
            }).finally(function () {
                comp.activity.loader(false);
            });
        };

        comp.loadFilm = function (filmUrl) {
            comp.activity.loader(true);
            parseEpisodePage(filmUrl, host).then(function (streams) {
                if (!streams || !streams.length) { comp.empty(); return; }
                var items = streams.map(function (s) {
                    return {
                        url: s.link,
                        title: s.title || 'Uaflix',
                        quality: s.quality || 'auto',
                        subtitle: s.subtitle || ''
                    };
                });
                comp.render(items);
            }).catch(function () {
                comp.error();
            }).finally(function () {
                comp.activity.loader(false);
            });
        };

        comp.loadSerial = function (serialUrl) {
            comp.activity.loader(true);
            getSeasonIndex(serialUrl).then(function (seasons) {
                var seasonNums = Object.keys(seasons).map(Number).sort(function (a, b) { return a - b; });
                if (!seasonNums.length) { comp.empty(); return; }

                // Check if user already picked a season
                var currentSeason = object.item && object.item.season ? object.item.season : null;
                var currentEp = object.item && object.item.episode ? object.item.episode : null;

                if (currentSeason == null) {
                    // Show season list
                    var seasonItems = seasonNums.map(function (s) {
                        return {
                            title: 'Сезон ' + s,
                            season: s,
                            url: seasons[s]
                        };
                    });
                    comp.renderSeasons(seasonItems, serialUrl, seasons);
                    return;
                }

                // Load episodes for chosen season
                var seasonUrl = seasons[currentSeason] || serialUrl;
                comp.loadSeasonEpisodes(serialUrl, seasonUrl, currentSeason, seasons, currentEp);
            }).catch(function () {
                comp.error();
            }).finally(function () {
                comp.activity.loader(false);
            });
        };

        comp.loadSeasonEpisodes = function (serialUrl, seasonUrl, seasonNum, allSeasons, currentEp) {
            comp.activity.loader(true);
            getSeasonEpisodes(seasonUrl, seasonNum, host).then(function (episodes) {
                if (!episodes || !episodes.length) { comp.empty(); return; }

                // Probe first episode to find player type
                var firstEp = episodes[0];
                return request(firstEp.url, { headers: { 'Referer': host } }).then(function (html) {
                    var doc = parseDoc(html);
                    var allIframes = extractAllIframes(doc, host);
                    var iframeUrl = allIframes[0];
                    var playerType = iframeUrl ? determinePlayerType(iframeUrl) : null;

                    if (playerType === 'ashdi-serial' || playerType === 'zetvideo-serial') {
                        // Parse multi-episode player
                        var parser = playerType === 'ashdi-serial' ? parseAshdiSerial : parseAshdiSerial;
                        return parseAshdiSerial(iframeUrl).then(function (voices) {
                            if (!voices || !voices.length) { comp.empty(); return; }
                            // Build voice/episode list
                            var voiceNames = voices.map(function (v) { return v.displayName; });
                            var activeVoice = voiceNames[0];

                            function buildEpisodes(voice) {
                                var seasonEps = (voice.seasons[seasonNum] || []);
                                return seasonEps.map(function (ep) {
                                    return {
                                        title: ep.title || ('Епізод ' + ep.number),
                                        episode: ep.number,
                                        season: seasonNum,
                                        url: ep.file,
                                        subtitle: ep.subtitle || ''
                                    };
                                });
                            }

                            comp.renderVoicesEpisodes(voices, voiceNames, activeVoice, seasonNum, buildEpisodes, currentEp);
                        });
                    } else {
                        // VOD-type: each episode is its own page
                        var items = episodes.map(function (ep) {
                            return {
                                title: ep.title || ('Епізод ' + ep.episode),
                                episode: ep.episode,
                                season: ep.season,
                                url: ep.url,
                                _vod: true
                            };
                        });
                        comp.renderEpisodes(items, currentEp);
                    }
                });
            }).catch(function () {
                comp.error();
            }).finally(function () {
                comp.activity.loader(false);
            });
        };

        // ========================
        //  Render helpers
        // ========================

        comp.render = function (streams) {
            var html = '';
            streams.forEach(function (s) {
                html += '<div class="uaflix-item selector" data-url="' + s.url + '" data-title="' + (s.title || '') + '">' +
                    '<div class="uaflix-item__title">' + (s.title || 'Uaflix') + '</div>' +
                    '<div class="uaflix-item__quality">' + (s.quality || '') + '</div>' +
                    '</div>';
            });
            comp.activity.append('<div class="uaflix-list">' + html + '</div>');

            comp.activity.body.querySelectorAll('.uaflix-item').forEach(function (el) {
                el.addEventListener('click', function () {
                    Lampa.Player.play({
                        url: el.dataset.url,
                        title: title + (el.dataset.title ? ' - ' + el.dataset.title : ''),
                        timeline: Lampa.Timeline.data(object)
                    });
                    Lampa.Player.playlist([{ url: el.dataset.url, title: el.dataset.title || 'Uaflix' }]);
                });
            });
        };

        comp.renderSeasons = function (seasonItems) {
            var html = '';
            seasonItems.forEach(function (s) {
                html += '<div class="uaflix-item selector" data-season="' + s.season + '">' +
                    '<div class="uaflix-item__title">Сезон ' + s.season + '</div>' +
                    '</div>';
            });
            comp.activity.append('<div class="uaflix-seasons">' + html + '</div>');

            comp.activity.body.querySelectorAll('.uaflix-item[data-season]').forEach(function (el) {
                el.addEventListener('click', function () {
                    var sn = parseInt(el.dataset.season, 10);
                    object.item = object.item || {};
                    object.item.season = sn;
                    comp.activity.body.innerHTML = '';
                    comp.create();
                });
            });
        };

        comp.renderEpisodes = function (items, currentEp) {
            var html = '';
            items.forEach(function (ep) {
                html += '<div class="uaflix-item selector" data-ep="' + ep.episode + '" data-url="' + ep.url + '">' +
                    '<div class="uaflix-item__title">' + ep.title + '</div>' +
                    '</div>';
            });
            comp.activity.append('<div class="uaflix-episodes">' + html + '</div>');

            comp.activity.body.querySelectorAll('.uaflix-item[data-ep]').forEach(function (el) {
                if (currentEp && parseInt(el.dataset.ep, 10) === currentEp) {
                    el.classList.add('uaflix-item--active');
                }
                el.addEventListener('click', function () {
                    var ep = items.find(function (i) { return i.episode === parseInt(el.dataset.ep, 10); });
                    if (!ep) return;

                    if (ep._vod) {
                        // Need to parse the episode page first
                        comp.activity.loader(true);
                        parseEpisodePage(ep.url, host).then(function (streams) {
                            comp.activity.loader(false);
                            if (!streams || !streams.length) { Lampa.Noty.show('Потік не знайдено'); return; }
                            playStream(streams[0], ep);
                        }).catch(function () {
                            comp.activity.loader(false);
                            Lampa.Noty.show('Помилка завантаження');
                        });
                    } else {
                        playStream({ url: ep.url, title: ep.title }, ep);
                    }
                });
            });
        };

        comp.renderVoicesEpisodes = function (voices, voiceNames, activeVoice, seasonNum, buildEpisodes, currentEp) {
            function renderAll(voiceName) {
                var voice = voices.find(function (v) { return v.displayName === voiceName; });
                if (!voice) return;
                var eps = buildEpisodes(voice);

                comp.activity.body.innerHTML = '';

                // Voice selector
                var vHtml = '<div class="uaflix-voices">';
                voiceNames.forEach(function (vn) {
                    vHtml += '<div class="uaflix-voice selector' + (vn === voiceName ? ' uaflix-voice--active' : '') + '" data-voice="' + vn + '">' + vn + '</div>';
                });
                vHtml += '</div>';

                // Episodes
                var eHtml = '<div class="uaflix-episodes">';
                eps.forEach(function (ep) {
                    eHtml += '<div class="uaflix-item selector" data-ep="' + ep.episode + '">' +
                        '<div class="uaflix-item__title">' + ep.title + '</div>' +
                        '</div>';
                });
                eHtml += '</div>';

                comp.activity.append(vHtml + eHtml);

                // Voice click
                comp.activity.body.querySelectorAll('.uaflix-voice').forEach(function (el) {
                    el.addEventListener('click', function () { renderAll(el.dataset.voice); });
                });

                // Episode click
                comp.activity.body.querySelectorAll('.uaflix-item[data-ep]').forEach(function (el) {
                    var epNum = parseInt(el.dataset.ep, 10);
                    if (currentEp && epNum === currentEp) el.classList.add('uaflix-item--active');
                    el.addEventListener('click', function () {
                        var ep = eps.find(function (e) { return e.episode === epNum; });
                        if (!ep) return;
                        playStream({ url: ep.url, title: voiceName + ' - ' + ep.title, subtitle: ep.subtitle }, ep);
                    });
                });
            }

            renderAll(activeVoice);
        };

        function playStream(stream, ep) {
            var playerData = {
                url: stream.url,
                title: title + (ep ? ' — ' + (ep.title || ('S' + (ep.season || '') + 'E' + (ep.episode || ''))) : '') +
                       (stream.title ? ' [' + stream.title + ']' : ''),
                timeline: Lampa.Timeline.data(object)
            };
            if (stream.subtitle) playerData.subtitle = stream.subtitle;
            Lampa.Player.play(playerData);
        }

        comp.empty = function () {
            comp.activity.append('<div class="uaflix-empty">Контент не знайдено</div>');
        };

        comp.error = function () {
            comp.activity.append('<div class="uaflix-empty">Помилка завантаження</div>');
        };

        comp.destroy = function () {};
    }

    // ========================
    //  CSS
    // ========================
    (function () {
        var style = document.createElement('style');
        style.textContent = [
            '.uaflix-list, .uaflix-episodes, .uaflix-seasons { display:flex; flex-wrap:wrap; gap:1em; padding:1em; }',
            '.uaflix-voices { display:flex; gap:.5em; padding:.5em 1em; flex-wrap:wrap; }',
            '.uaflix-voice { background:rgba(255,255,255,.1); padding:.3em .8em; border-radius:.3em; cursor:pointer; }',
            '.uaflix-voice--active { background:var(--color-second,#e74c3c); color:#fff; }',
            '.uaflix-item { background:rgba(255,255,255,.07); border-radius:.5em; padding:.8em 1.2em; cursor:pointer; min-width:10em; }',
            '.uaflix-item:hover, .uaflix-item:focus { background:rgba(255,255,255,.18); }',
            '.uaflix-item--active { border:2px solid var(--color-second,#e74c3c); }',
            '.uaflix-item__title { font-size:1em; font-weight:500; }',
            '.uaflix-item__quality { font-size:.75em; color:rgba(255,255,255,.5); margin-top:.2em; }',
            '.uaflix-empty { padding:2em; color:rgba(255,255,255,.5); }'
        ].join('\n');
        document.head.appendChild(style);
    })();

    // ========================
    //  Settings panel
    // ========================
    function addSettings() {
        Lampa.SettingsApi.addParam({
            component: 'online',
            param: { name: PLUGIN_ID + '_host', type: 'input', default: DEFAULT_HOST },
            field: { name: 'UaFlix — хост', placeholder: DEFAULT_HOST }
        });
    }

    // ========================
    //  Register plugin
    // ========================
    function register() {
        Lampa.Component.add(PLUGIN_ID, UaflixComponent);

        Lampa.Listener.follow('online', function (e) {
            if (e.type === 'start') {
                var item = e.object.card;
                if (!item) return;
                e.object.items.push({
                    title: PLUGIN_NAME,
                    component: PLUGIN_ID,
                    onlyForce: false,
                    onlyNew: false,
                    plugin: PLUGIN_ID
                });
            }
        });
    }

    if (window.Lampa) {
        addSettings();
        register();
    } else {
        document.addEventListener('DOMContentLoaded', function () {
            if (window.Lampa) { addSettings(); register(); }
        });
    }

})();
