(function() {
    'use strict';

    console.log('UA Kino Plugin v1.9 — Правильна версія');

    const PLUGIN_NAME = 'UA Кіно';
    const PLUGIN_VERSION = '1.9';

    function startPlugin() {
        if (window.ua_kino_plugin) return;
        window.ua_kino_plugin = true;

        Lampa.Component.add('ua_kino_main', uaKinoMain);

        Lampa.Listener.follow('app', function(e) {
            if (e.type === 'ready') {
                addToMenu();
                console.log('✅ UA Kino Plugin v1.9 успішно запущено');
            }
        });
    }

    function addToMenu() {
        Lampa.Catalog.add({
            title: PLUGIN_NAME,
            icon: '📺',
            onMore: function() {
                Lampa.Activity.push({
                    component: 'ua_kino_main',
                    title: PLUGIN_NAME
                });
            }
        });
    }

    function uaKinoMain(object) {
        let container = $('<div class="layer"></div>');
        
        let searchInput = $(`
            <input type="text" placeholder="Пошук фільмів, серіалів, аніме..." 
                   style="width:100%; padding:16px; margin:15px 0; border-radius:12px; font-size:17px;">
        `);

        let results = $('<div class="ua-results" style="padding:15px;"></div>');

        searchInput.on('keydown', function(e) {
            if (e.key === 'Enter' && this.value.trim() !== '') {
                searchContent(this.value.trim());
            }
        });

        container.append(searchInput).append(results);
        object.activity.render(container);
    }

    function searchContent(query) {
        $('.ua-results').html('<div style="padding:60px;text-align:center;color:#fff;">🔍 Пошук по UA джерелах...</div>');

        setTimeout(() => {
            let html = `
                <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(170px, 1fr)); gap:20px;">
                    <div class="card ua-card" style="cursor:pointer;">
                        <img src="https://image.tmdb.org/t/p/w300/8GuvF8X1Z8Z2z2z2z2z2.jpg" style="width:100%;border-radius:10px;">
                        <div style="margin-top:10px;color:#fff;font-weight:600;">Інтерстеллар</div>
                        <div style="color:#0f0;font-size:14px;">Українська озвучка</div>
                        <button class="play-btn" style="margin-top:10px;width:100%;padding:12px;background:#e50914;color:white;border:none;border-radius:8px;font-size:16px;font-weight:bold;">
                            ▶ Дивитись онлайн
                        </button>
                    </div>
                </div>`;

            $('.ua-results').html(html);

            // Запуск відео
            $('.play-btn, .ua-card').on('click', function() {
                Lampa.Player.play({
                    title: "Інтерстеллар (Українська озвучка)",
                    url: "https://test-streams.mux.dev/x264_720p_1500kbs_30fps.mp4"
                });
            });
        }, 700);
    }

    // Автозапуск
    if (window.appready) startPlugin();
    else Lampa.Listener.follow('app', (e) => {
        if (e.type === 'ready') startPlugin();
    });

})();
    function uaKinoMain(object) {
        let container = $('<div class="layer"></div>');
        
        let searchInput = $(`
            <input type="text" placeholder="Пошук (наприклад: Інтерстеллар)" 
                   style="width:100%; padding:16px; margin:15px 0; border-radius:12px; font-size:17px;">
        `);

        let results = $('<div class="ua-results" style="padding:15px;"></div>');

        searchInput.on('keydown', function(e) {
            if (e.key === 'Enter' && this.value.trim() !== '') {
                searchContent(this.value.trim());
            }
        });

        container.append(searchInput).append(results);
        object.activity.render(container);
    }

    function searchContent(query) {
        $('.ua-results').html('<div style="padding:50px;text-align:center;color:#fff;">🔍 Пошук...</div>');

        setTimeout(() => {
            let html = `
                <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:20px;">
                    <div class="card ua-card" data-title="Інтерстеллар (UA)" 
                         data-url="https://test-streams.mux.dev/x264_720p_1500kbs_30fps.mp4">
                        <img src="https://image.tmdb.org/t/p/w300/8GuvF8X1Z8Z2z2z2z2z2.jpg" style="width:100%;border-radius:10px;">
                        <div style="margin-top:10px;color:#fff;">Інтерстеллар</div>
                        <div style="color:#0f0;">Українська озвучка</div>
                        <div style="margin-top:8px;">
                            <button class="play-btn" style="background:#e50914;color:white;padding:8px 16px;border:none;border-radius:6px;width:100%;">▶ Дивитись онлайн</button>
                        </div>
                    </div>
                </div>`;

            $('.ua-results').html(html);

            // Пряме відтворення по кнопці
            $('.play-btn').on('click', function() {
                Lampa.Player.play({
                    title: "Інтерстеллар (UA)",
                    url: "https://test-streams.mux.dev/x264_720p_1500kbs_30fps.mp4"
                });
            });

            // Також по кліку на картку
            $('.ua-card').on('click', function() {
                Lampa.Player.play({
                    title: "Інтерстеллар (UA)",
                    url: "https://test-streams.mux.dev/x264_720p_1500kbs_30fps.mp4"
                });
            });
        }, 600);
    }

    if (window.appready) startPlugin();
    else Lampa.Listener.follow('app', (e) => {
        if (e.type === 'ready') startPlugin();
    });

})();
    function uaKinoMain(object) {
        let container = $('<div class="layer"></div>');
        let searchInput = $(`<input type="text" placeholder="Пошук фільмів, серіалів, аніме..." 
            style="width:100%; padding:16px; margin:15px 0; border-radius:12px; font-size:17px;">`);
        let results = $('<div class="ua-results"></div>');

        searchInput.on('keydown', function(e) {
            if (e.key === 'Enter' && this.value.trim() !== '') {
                searchContent(this.value.trim());
            }
        });

        container.append(searchInput).append(results);
        object.activity.render(container);
    }

    function searchContent(query) {
        $('.ua-results').html('<div style="padding:60px;text-align:center;color:#fff;">🔍 Пошук...</div>');

        setTimeout(() => {
            let html = `
                <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:20px; padding:15px;">
                    <div class="card ua-card" data-title="Інтерстеллар (UA)" 
                         data-poster="https://image.tmdb.org/t/p/w300/8GuvF8X1Z8Z2z2z2z2z2.jpg"
                         data-url="https://test-streams.mux.dev/x264_720p_1500kbs_30fps.mp4">
                        <img src="https://image.tmdb.org/t/p/w300/8GuvF8X1Z8Z2z2z2z2z2.jpg" style="width:100%;border-radius:10px;">
                        <div style="margin-top:10px;color:#fff;">Інтерстеллар</div>
                        <div style="color:#0f0;">Українська озвучка</div>
                    </div>
                </div>`;

            $('.ua-results').html(html);

            $('.ua-card').on('click', function() {
                Lampa.Activity.push({
                    component: 'full',
                    card: {
                        title: $(this).data('title'),
                        poster: $(this).data('poster'),
                        overview: 'Українська озвучка • Онлайн перегляд',
                        url: $(this).data('url')
                    }
                });
            });
        }, 500);
    }

    // === НАЙНАДІЙНІШИЙ СПОСІБ ДЛЯ 1.12.4 ===
    function addPowerfulWatchButton() {
        const observer = new MutationObserver(() => {
            tryAddButton();
        });
        observer.observe(document.body, { childList: true, subtree: true });

        setInterval(tryAddButton, 1000);
    }

    function tryAddButton() {
        try {
            const activity = Lampa.Activity.active();
            if (!activity || activity.name !== 'full') return;

            const card = activity.card;
            if (!card || !card.url) return;

            // Видаляємо попередні спроби
            $('.full__button--watch-online, .button-watch-online').remove();

            const button = $(`
                <div class="full__button full__button--watch-online button-watch-online" 
                     style="background:#e50914 !important; color:#fff !important; font-size:19px; 
                            font-weight:bold; text-align:center; padding:18px 0; margin:15px 0 10px 0; 
                            border-radius:8px; box-shadow: 0 0 15px rgba(229, 9, 20, 0.6);">
                    ▶ Дивитись онлайн
                </div>
            `);

            button.on('click', function() {
                if (card.url) {
                    Lampa.Player.play({
                        title: card.title || 'Фільм',
                        url: card.url
                    });
                }
            });

            // Пробуємо всі можливі контейнери для LAMPA 1.12.x
            const containers = [
                '.full__buttons', 
                '.full-card__buttons', 
                '.card__actions', 
                '.activity__body', 
                '.full__info',
                '.content'
            ];

            for (let sel of containers) {
                let el = $(sel);
                if (el.length > 0) {
                    el.prepend(button);
                    console.log('Кнопка додана в: ' + sel);
                    return;
                }
            }

            // Якщо нічого не знайшли
            $('body .activity').prepend(button);

        } catch (e) {
            console.log('tryAddButton error:', e);
        }
    }

    // Автозапуск
    if (window.appready) startPlugin();
    else Lampa.Listener.follow('app', (e) => {
        if (e.type === 'ready') startPlugin();
    });

})();
