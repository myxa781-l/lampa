(function () {
    'use strict';

    const rules = [
        { pattern: /смотреть\s*!?/i,          replaceWith: 'Основной' },
        { pattern: /торрент(ы|ов)?/i,         replaceWith: 'Торренты' },
        { pattern: /^онлайн$/i,               replaceWith: 'Дополнительный' },
    ];

    function renameInNode(node) {
        if (node.nodeType !== Node.TEXT_NODE) return;
        let text = node.nodeValue.trim();
        if (!text) return;

        for (let rule of rules) {
            if (rule.pattern.test(text)) {
                node.nodeValue = node.nodeValue.replace(text, rule.replaceWith);
                return; // одно совпадение → выходим
            }
        }
    }

    function processElement(el) {
        if (!el || el.children?.length > 5) return; // защита от больших блоков

        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
            renameInNode(node);
        }
    }

    // Наблюдатель за всем телом (или можно за #app / .lampa__content)
    const observer = new MutationObserver((mutations) => {
        for (let mutation of mutations) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        processElement(node);
                        // рекурсивно проходим всех потомков
                        node.querySelectorAll('span, div, button').forEach(processElement);
                    }
                });
            }
        }
    });

    function init() {
        // сразу применяем ко всему документу
        document.querySelectorAll('span, div, button').forEach(processElement);

        // запускаем наблюдатель
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        console.log("[ButtonRenamer] запущен через MutationObserver");
    }

    // ждём, пока Lampa хоть немного загрузится
    if (document.body) {
        init();
    } else {
        document.addEventListener('DOMContentLoaded', init);
    }

})();
