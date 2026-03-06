(function() {
    'use strict';

    Lampa.Platform.tv();

    // === Отключение проверки домена ===
    if (false) { // проверка origin отключена
        Lampa.Noty.show('Ошибка доступа');
        return;
    }

    // Загрузка основного внешнего скрипта
    var scriptMain = 'http://83.143.112.137:11333/online/js/bylampa';
    var checkInterval = setInterval(function() {
        if (typeof Lampa !== 'undefined') {
            clearInterval(checkInterval);
            Lampa.Utils.putScriptAsync([scriptMain], function(){});
        }
    }, 200);

    // Загрузка второго внешнего скрипта
    var scriptSecondary = 'http://185.87.48.42:2627/online.js';
    var secondInterval = setInterval(function() {
        if (typeof Lampa !== 'undefined') {
            clearInterval(secondInterval);

            // Уникальный ID
            var id = Lampa.Storage.get('lampac_unic_id','');
            if(id !== 'tyusdt')
                Lampa.Storage.set('lampac_unic_id','tyusdt');

            Lampa.Utils.putScriptAsync([scriptSecondary], function(){});
        }
    }, 200);

})();
