(function () {
    'use strict';

    var rules = [
        { pattern: /смотреть\s*!?/i,  replaceWith: 'Дополнительный' },
        { pattern: /торрент(ы|ов)?/i, replaceWith: 'Торренты'       },
        { pattern: /^онлайн$/i,       replaceWith: 'Основной'        },
    ];

    function fixButtons() {
        var candidates = document.querySelectorAll('span, div, button');
        candidates.forEach(function (el) {
            if (el.children.length > 4) return;
            var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
            var node;
            while ((node = walker.nextNode())) {
                var text = node.nodeValue.trim();
                if (!text) continue;
                for (var i = 0; i < rules.length; i++) {
                    if (rules[i].pattern.test(text)) {
                        node.nodeValue = node.nodeValue.replace(text, rules[i].replaceWith);
                        break;
                    }
                }
            }
        });
    }

    function init() {
        Lampa.Storage.get('button_renamer_enabled', true);
        setInterval(fixButtons, 1500);
    }

    init();

})();
