(function () {
    try {
        const plugin = {
            name: 'UAFLIX [OK]',
            version: 'debug-1.0',
            icon: 'https://uafix.net/favicon.ico',
            catalogs: async function () {
                return [
                    {
                        title: 'UAFLIX – Останнє',
                        url: 'https://uafix.net',
                        type: 'movie'
                    }
                ];
            },
            movies: async function (url) {
                const html = await fetch(url).then(r => r.text());
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const items = [];

                doc.querySelectorAll('.short a.short-img').forEach(el => {
                    const href = el.href;
                    const title = el.getAttribute('title') || el.textContent.trim() || 'Без назви';
                    if (href) items.push({ title, url: href });
                });

                return items;
            },
            resolve: async function (url) {
                const html = await fetch(url).then(r => r.text());
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const iframe = doc.querySelector('iframe');
                const videoUrl = iframe?.src || null;
                return { url: videoUrl, subtitles: [] };
            }
        };

        Lampa.Plugins.register(plugin);
    } catch (e) {
        Lampa.Plugins.register({
            name: 'UAFLIX [ERR: ' + (e.message || 'невідома помилка') + ']',
            version: 'debug-1.0',
            catalogs: async () => [],
            movies: async () => [],
            resolve: async () => ({ url: null })
        });
    }
})();
