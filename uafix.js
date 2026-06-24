(function () {
    'use strict';

    var UAFIX_DOMAIN = 'https://uafix.net';
    var ZET_DOMAIN   = 'https://zetvideo.net';

    // ========== Утилиты ==========

    function proxy(url) {
        // Lampa может использовать прокси для CORS; если не нужен — возвращаем как есть
        if (typeof Lampa !== 'undefined' && Lampa.Storage && Lampa.Storage.get('proxy_url')) {
            return Lampa.Storage.get('proxy_url') + url;
        }
        return url;
    }

    function get(url) {
        return new Promise(function (resolve, reject) {
            var network = new Lampa.Reguest();
            network.silent(proxy(url), function (html) {
                resolve(html);
            }, function (err) {
                reject(err);
            });
        });
    }

    // Парсер HTML → DOM
    function parseHTML(html) {
        var parser = new DOMParser();
        return parser.parseFromString(html, 'text/html');
    }

    // ========== Компонент источника ==========

    function UAFlix(component, object) {
        var network = new Lampa.Reguest();
        var scroll  = new Lampa.Scroll({ mask: true, over: true });
        var items   = [];
        var last;

        // ---------- ПОИСК ----------
        this.search = function (query, page) {
            // uafix.net поиск: /index.php?do=search&subaction=search&story=ЗАПРОС
            var url = UAFIX_DOMAIN + '/index.php?do=search&subaction=search&story=' + encodeURIComponent(query.movie || query.search || query);

            get(url).then(function (html) {
                var doc = parseHTML(html);
                var cards = doc.querySelectorAll('.short-item, .shortstory, .movie-item, .item');
                var results = [];

                cards.forEach(function (card) {
                    var link  = card.querySelector('a');
                    var img   = card.querySelector('img');
                    var title = card.querySelector('.short-title, .movie-title, h3, h2');

                    if (link) {
                        results.push({
                            url:   link.getAttribute('href') || '',
                            title: title ? title.textContent.trim() : (link.textContent.trim() || ''),
                            image: img ? img.getAttribute('src') || '' : '',
                        });
                    }
                });

                if (results.length === 0) {
                    // Альтернативный парсинг: ищем все ссылки с /serials/ или /films/
                    doc.querySelectorAll('a[href*="/serials/"], a[href*="/films/"]').forEach(function (a) {
                        var href = a.getAttribute('href');
                        if (href && href !== '#') {
                            results.push({
                                url:   href.startsWith('http') ? href : UAFIX_DOMAIN + href,
                                title: a.textContent.trim(),
                                image: '',
                            });
                        }
                    });
                }

                // Убираем дубли
                var seen = {};
                results = results.filter(function (r) {
                    if (!r.url || seen[r.url]) return false;
                    seen[r.url] = true;
                    return true;
                });

                component.render(results.map(function (r) {
                    return {
                        title: r.title,
                        url:   r.url,
                        image: r.image,
                    };
                }), query);

            }).catch(function () {
                component.empty();
            });
        };

        // ---------- КАРТОЧКА (сезоны / серии / фильм) ----------
        this.full = function (data, params) {
            var url = data.url;

            if (!url) {
                component.empty();
                return;
            }

            if (!url.startsWith('http')) url = UAFIX_DOMAIN + url;

            get(url).then(function (html) {
                var doc  = parseHTML(html);
                var result = { seasons: [], movie: null };

                // --- Проверяем: это фильм (есть iframe/vod прямо на странице)? ---
                var vodMatch = html.match(/https?:\/\/zetvideo\.net\/vod\/(\d+)/);
                if (vodMatch) {
                    // Это страница с плеером (фильм или конкретная серия)
                    result.movie = {
                        vodId:   vodMatch[1],
                        vodUrl:  vodMatch[0],
                        title:   data.title || doc.querySelector('h1') && doc.querySelector('h1').textContent.trim() || '',
                    };
                }

                // --- Ищем сезоны ---
                var seasonLinks = doc.querySelectorAll('a[href*="sezon-"], a[href*="season-"]');
                var seenSeasons = {};

                seasonLinks.forEach(function (a) {
                    var href = a.getAttribute('href') || '';
                    var text = a.textContent.trim();
                    // Извлекаем номер сезона
                    var sMatch = href.match(/sezon-?(\d+)/i) || href.match(/season-?(\d+)/i);
                    var sNum   = sMatch ? parseInt(sMatch[1]) : 0;
                    var key    = sNum || href;

                    if (!seenSeasons[key]) {
                        seenSeasons[key] = true;
                        result.seasons.push({
                            number: sNum,
                            title:  text || ('Сезон ' + sNum),
                            url:    href.startsWith('http') ? href : UAFIX_DOMAIN + href,
                        });
                    }
                });

                // --- Ищем серии на текущей странице ---
                var episodes = parseEpisodes(doc, html);

                if (result.seasons.length > 0 && episodes.length === 0) {
                    // Есть сезоны — показываем выбор сезона
                    component.render(result.seasons.map(function (s) {
                        return {
                            title: s.title,
                            url:   s.url,
                            season: true,
                        };
                    }), data);

                } else if (episodes.length > 0) {
                    // Есть серии — показываем список серий
                    component.render(episodes.map(function (ep) {
                        return {
                            title:  ep.title,
                            url:    ep.url,
                            vodId:  ep.vodId || null,
                        };
                    }), data);

                } else if (result.movie) {
                    // Фильм — сразу stream
                    UAFlix.prototype.stream.call(this, result.movie, params);
                } else {
                    component.empty();
                }

            }).catch(function () {
                component.empty();
            });
        };

        // ---------- ПАРСИНГ СЕРИЙ ----------
        function parseEpisodes(doc, html) {
            var episodes = [];
            var seen = {};

            // Вариант 1: блок #sers-wr
            var sersWr = doc.querySelector('#sers-wr');
            if (sersWr) {
                sersWr.querySelectorAll('a').forEach(function (a) {
                    addEpisode(a, episodes, seen);
                });
            }

            // Вариант 2: ссылки с episode в URL
            if (episodes.length === 0) {
                doc.querySelectorAll('a[href*="episode"]').forEach(function (a) {
                    addEpisode(a, episodes, seen);
                });
            }

            // Вариант 3: ссылки season-XX-episode-XX
            if (episodes.length === 0) {
                doc.querySelectorAll('a[href*="season-"]').forEach(function (a) {
                    var href = a.getAttribute('href') || '';
                    if (href.match(/season-\d+-episode-\d+/)) {
                        addEpisode(a, episodes, seen);
                    }
                });
            }

            return episodes;
        }

        function addEpisode(a, episodes, seen) {
            var href = a.getAttribute('href') || '';
            if (!href || href === '#' || seen[href]) return;
            seen[href] = true;

            var text = a.textContent.trim();
            var epMatch = href.match(/episode-?(\d+)/i);
            var epNum   = epMatch ? parseInt(epMatch[1]) : episodes.length + 1;

            episodes.push({
                title: text || ('Серія ' + epNum),
                url:   href.startsWith('http') ? href : UAFIX_DOMAIN + href,
                number: epNum,
            });
        }

        // ---------- ПОЛУЧЕНИЕ ПОТОКА ----------
        this.stream = function (data, params) {
            var url = data.url;

            // Если vodId уже известен — сразу идём на ZetVideo
            if (data.vodId) {
                return fetchStream(data.vodId, data.title || '');
            }

            if (!url) {
                component.empty();
                return;
            }

            if (!url.startsWith('http')) url = UAFIX_DOMAIN + url;

            get(url).then(function (html) {
                // Ищем vod ID
                var vodMatch = html.match(/https?:\/\/zetvideo\.net\/vod\/(\d+)/);
                if (!vodMatch) {
                    // Пробуем другие паттерны
                    vodMatch = html.match(/vod\/(\d+)/);
                }

                if (!vodMatch) {
                    // Может m3u8 прямо в HTML?
                    var m3u8Match = html.match(/https?:\/\/zetvideo\.net\/vid\/[^"'\s]+\.m3u8/);
                    if (m3u8Match) {
                        playStream(m3u8Match[0], data.title || '');
                        return;
                    }
                    component.empty();
                    return;
                }

                fetchStream(vodMatch[1], data.title || '');

            }).catch(function () {
                component.empty();
            });
        };

        function fetchStream(vodId, title) {
            var vodUrl = ZET_DOMAIN + '/vod/' + vodId;

            get(vodUrl).then(function (html) {
                // Ищем m3u8 в ответе ZetVideo
                var m3u8Match = html.match(/https?:\/\/zetvideo\.net\/vid\/[^"'\s]+\.m3u8/);

                if (!m3u8Match) {
                    // Ищем src у <video>
                    var videoSrc = html.match(/<video[^>]+src=["']([^"']+)/);
                    if (videoSrc) {
                        m3u8Match = [videoSrc[1]];
                    }
                }

                if (!m3u8Match) {
                    // Ищем любой .m3u8
                    var anyM3u8 = html.match(/["']([^"']*\.m3u8[^"']*)/);
                    if (anyM3u8) {
                        m3u8Match = [anyM3u8[1]];
                    }
                }

                if (m3u8Match) {
                    var streamUrl = m3u8Match[0];
                    if (!streamUrl.startsWith('http')) {
                        streamUrl = ZET_DOMAIN + streamUrl;
                    }
                    playStream(streamUrl, title);
                } else {
                    component.empty();
                }

            }).catch(function () {
                component.empty();
            });
        }

        function playStream(url, title) {
            // Парсим мастер-плейлист для получения качеств
            get(url).then(function (m3u8) {
                var qualities = {};
                var lines = m3u8.split('\n');

                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i].trim();
                    if (line.startsWith('#EXT-X-STREAM-INF')) {
                        var resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/);
                        var quality  = resMatch ? resMatch[1] + 'p' : 'auto';

                        // Следующая строка — URL
                        if (i + 1 < lines.length) {
                            var streamLine = lines[i + 1].trim();
                            if (streamLine && !streamLine.startsWith('#')) {
                                if (!streamLine.startsWith('http')) {
                                    // Относительный URL
                                    streamLine = url.replace(/\/[^\/]*$/, '/') + streamLine;
                                }
                                qualities[quality] = streamLine;
                            }
                        }
                    }
                }

                // Если нет качеств — это не мастер-плейлист, играем как есть
                if (Object.keys(qualities).length === 0) {
                    qualities['auto'] = url;
                }

                var qualityKeys = Object.keys(qualities);

                // Формируем объект для Lampa
                var streamData = {
                    title: title,
                    quality: qualities,
                    url: qualities[qualityKeys[0]],
                };

                // Вызываем плеер Lampa
                if (typeof Lampa !== 'undefined' && Lampa.Player) {
                    Lampa.Player.play(streamData);
                } else {
                    // Fallback: пробуем component
                    component.render([streamData]);
                }

            }).catch(function () {
                // Если не смогли распарсить — играем мастер напрямую
                if (typeof Lampa !== 'undefined' && Lampa.Player) {
                    Lampa.Player.play({
                        title: title,
                        url: url,
                    });
                }
            });
        }

        this.disable = function () {
            network.clear();
        };

        this.destroy = function () {
            network.clear();
            scroll.destroy();
        };
    }

    // ========== Регистрация плагина ==========

    // Метод 1: Как источник (Online-плагин)
    if (typeof Lampa !== 'undefined') {

        // Регистрация как источник для Online-плагина
        if (Lampa.Params) {
            // Добавляем в список источников
            var sources = Lampa.Params.values && Lampa.Params.values['online_sources'];
            if (sources) {
                sources['uafix'] = 'UAFlix';
            }
        }

        // Регистрация компонента
        Lampa.Component.add('online_mod_uafix', UAFix);

        // Для совместимости: если используется Lampa.Api.sources
        if (Lampa.Api && Lampa.Api.sources) {
            Lampa.Api.sources['uafix'] = UAFix;
        }

        // Альтернативная регистрация через Manifest
        if (Lampa.Manifest) {
            Lampa.Manifest.plugins = Lampa.Manifest.plugins || {};
            Lampa.Manifest.plugins['uafix'] = {
                type: 'online',
                name: 'UAFlix',
                version: '1.0.0',
                description: 'Джерело UAFlix (uafix.net) — пошук, сезони, серії, HLS потоки через ZetVideo',
            };
        }

        Lampa.Utils.putScriptError && console.log('UAFlix plugin loaded');
    }

    // ========== Балансер для Online-плагина ==========
    // Если используется стандартный Lampa Online,
    // регистрируем как балансер

    function UAFixBalancer() {
        var SOURCE_NAME = 'uafix';
        var SOURCE_TITLE = 'UAFlix';

        this.search = function (object, resolve) {
            var query = object.search || object.title || '';

            var searchUrl = UAFIX_DOMAIN + '/index.php?do=search&subaction=search&story=' + encodeURIComponent(query);

            get(searchUrl).then(function (html) {
                var doc = parseHTML(html);
                var results = [];

                // Парсим результаты поиска
                doc.querySelectorAll('a[href]').forEach(function (a) {
                    var href = a.getAttribute('href') || '';
                    if ((href.includes('/serials/') || href.includes('/films/')) && !href.endsWith('/serials/') && !href.endsWith('/films/')) {
                        var title = a.textContent.trim();
                        if (title && title.length > 2 && !results.some(function(r){ return r.url === href; })) {
                            results.push({
                                url: href.startsWith('http') ? href : UAFIX_DOMAIN + href,
                                title: title,
                            });
                        }
                    }
                });

                resolve(results);

            }).catch(function () {
                resolve([]);
            });
        };

        this.seasons = function (object, resolve) {
            var url = object.url;
            if (!url) return resolve([]);

            get(url).then(function (html) {
                var doc = parseHTML(html);
                var seasons = [];
                var seen = {};

                doc.querySelectorAll('a[href*="sezon-"], a[href*="season-"]').forEach(function (a) {
                    var href = a.getAttribute('href') || '';
                    var text = a.textContent.trim();
                    if (!seen[href] && href !== '#') {
                        seen[href] = true;
                        var sMatch = href.match(/sezon-?(\d+)/i) || href.match(/season-?(\d+)/i);
                        seasons.push({
                            number: sMatch ? parseInt(sMatch[1]) : seasons.length + 1,
                            title: text || ('Сезон ' + (seasons.length + 1)),
                            url: href.startsWith('http') ? href : UAFIX_DOMAIN + href,
                        });
                    }
                });

                resolve(seasons);

            }).catch(function () {
                resolve([]);
            });
        };

        this.episodes = function (object, resolve) {
            var url = object.url;
            if (!url) return resolve([]);

            get(url).then(function (html) {
                var doc = parseHTML(html);
                var episodes = [];
                var seen = {};

                // #sers-wr или ссылки с episode
                var container = doc.querySelector('#sers-wr');
                var links = container
                    ? container.querySelectorAll('a')
                    : doc.querySelectorAll('a[href*="episode"]');

                links.forEach(function (a) {
                    var href = a.getAttribute('href') || '';
                    var text = a.textContent.trim();
                    if (!seen[href] && href !== '#') {
                        seen[href] = true;
                        var epMatch = href.match(/episode-?(\d+)/i);
                        episodes.push({
                            number: epMatch ? parseInt(epMatch[1]) : episodes.length + 1,
                            title: text || ('Серія ' + (episodes.length + 1)),
                            url: href.startsWith('http') ? href : UAFIX_DOMAIN + href,
                        });
                    }
                });

                resolve(episodes);

            }).catch(function () {
                resolve([]);
            });
        };

        this.stream = function (object, resolve) {
            var url = object.url;
            if (!url) return resolve({ url: '' });

            get(url).then(function (html) {
                // 1) Ищем zetvideo vod ID
                var vodMatch = html.match(/https?:\/\/zetvideo\.net\/vod\/(\d+)/);

                if (!vodMatch) {
                    // Может m3u8 прямо в HTML
                    var directM3u8 = html.match(/https?:\/\/zetvideo\.net\/vid\/[^"'\s]+\.m3u8/);
                    if (directM3u8) {
                        return resolveQualities(directM3u8[0], resolve);
                    }
                    return resolve({ url: '' });
                }

                var vodUrl = ZET_DOMAIN + '/vod/' + vodMatch[1];

                // 2) Получаем страницу ZetVideo
                get(vodUrl).then(function (zetHtml) {
                    var m3u8 = zetHtml.match(/https?:\/\/zetvideo\.net\/vid\/[^"'\s]+\.m3u8/);

                    if (!m3u8) {
                        var videoSrc = zetHtml.match(/<video[^>]+src=["']([^"']+)/);
                        if (videoSrc) m3u8 = [videoSrc[1]];
                    }

                    if (!m3u8) {
                        var anyM3u8 = zetHtml.match(/["']([^"']*\.m3u8[^"']*)/);
                        if (anyM3u8) m3u8 = [anyM3u8[1]];
                    }

                    if (m3u8) {
                        var streamUrl = m3u8[0];
                        if (!streamUrl.startsWith('http')) streamUrl = ZET_DOMAIN + streamUrl;
                        resolveQualities(streamUrl, resolve);
                    } else {
                        resolve({ url: '' });
                    }

                }).catch(function () {
                    resolve({ url: '' });
                });

            }).catch(function () {
                resolve({ url: '' });
            });
        };

        function resolveQualities(masterUrl, resolve) {
            get(masterUrl).then(function (m3u8) {
                var qualities = {};
                var lines = m3u8.split('\n');

                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i].trim();
                    if (line.startsWith('#EXT-X-STREAM-INF')) {
                        var resMatch = line.match(/RESOLUTION=(\d+)x(\d+)/);
                        var bw = line.match(/BANDWIDTH=(\d+)/);
                        var label = resMatch ? resMatch[2] + 'p' : (bw ? Math.round(parseInt(bw[1]) / 1000) + 'k' : 'auto');

                        if (i + 1 < lines.length) {
                            var nextLine = lines[i + 1].trim();
                            if (nextLine && !nextLine.startsWith('#')) {
                                if (!nextLine.startsWith('http')) {
                                    nextLine = masterUrl.replace(/\/[^\/]*$/, '/') + nextLine;
                                }
                                qualities[label] = nextLine;
                            }
                        }
                    }
                }

                if (Object.keys(qualities).length === 0) {
                    qualities['auto'] = masterUrl;
                }

                resolve({
                    url: qualities[Object.keys(qualities)[0]],
                    quality: qualities,
                });

            }).catch(function () {
                resolve({
                    url: masterUrl,
                    quality: { auto: masterUrl },
                });
            });
        }
    }

    // Регистрация балансера
    if (typeof Lampa !== 'undefined') {
        if (Lampa.Balancer) {
            Lampa.Balancer.add('uafix', UAFixBalancer);
        }

        // Альтернативная регистрация через Online
        if (typeof $online_sources !== 'undefined') {
            $online_sources['uafix'] = UAFixBalancer;
        }

        console.log('[UAFlix] Plugin v1.0.0 loaded');
    }

})();
