let currentFromQuantity = 0;
let currentToQuantity = Infinity;
let showGibdd = true;

ymaps.ready(init);

function init() {
    fetch('anna.json')
        .then(response => response.json())
        .then(obj => {
            console.log('raw data:', obj);

            // ✅ Возвращаем поиск справа
            const searchControls = new ymaps.control.SearchControl({
                options: {
                    float: 'right',
                    noPlacemark: true
                }
            });

            // ✅ Карта + поиск справа
            const myMap = new ymaps.Map('map', {
                center: [55.76, 37.64],
                zoom: 7,
                controls: [searchControls]
            });

            // Убираем лишние контролы (как было у тебя)
            const removeControls = [
                'geolocationControl',
                'trafficControl',
                'fullscreenControl',
                'zoomControl',
                'rulerControl',
                'typeSelector'
            ];
            removeControls.forEach(ctrl => myMap.controls.remove(ctrl));

            // ObjectManager
            const objectManager = new ymaps.ObjectManager({
                clusterize: true,
                clusterIconLayout: 'default#pieChart'
            });

            // Границы карты
            let minLatitude = Infinity, maxLatitude = -Infinity;
            let minLongitude = Infinity, maxLongitude = -Infinity;

            // Диапазон по quantity (только для НЕ-синих точек)
            let minQuantity = Infinity;
            let maxQuantity = -Infinity;

            const validFeatures = [];

            obj.features.forEach(feature => {
                // --- координаты ---
                if (!feature.geometry || !Array.isArray(feature.geometry.coordinates)) return;

                const [longitude, latitude] = feature.geometry.coordinates;
                const lat = Number(latitude);
                const lon = Number(longitude);

                if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

                // Яндекс ждёт [lat, lon]
                feature.geometry.coordinates = [lat, lon];

                minLatitude = Math.min(minLatitude, lat);
                maxLatitude = Math.max(maxLatitude, lat);
                minLongitude = Math.min(minLongitude, lon);
                maxLongitude = Math.max(maxLongitude, lon);

                const preset = feature.options && feature.options.preset;
                const isBlue = preset === 'islands#blueIcon';

                // --- quantity ---
                const q = extractQuantity(feature);

                if (!isBlue) {
                    // Для НЕ-синих количество обязательно
                    if (q === null) return;

                    if (!feature.properties) feature.properties = {};
                    feature.properties.quantity = q;

                    if (q < minQuantity) minQuantity = q;
                    if (q > maxQuantity) maxQuantity = q;
                }

                // Синие точки (ГИБДД) добавляем всегда
                validFeatures.push(feature);
            });

            if (validFeatures.length === 0) {
                console.warn('Нет точек для отображения.');
                return;
            }

            // Если не нашлось ни одной НЕ-синей точки с количеством
            if (minQuantity === Infinity || maxQuantity === -Infinity) {
                minQuantity = 0;
                maxQuantity = 0;
            }

            console.log('quantity min =', minQuantity, 'max =', maxQuantity);

            // Подменяем features на отфильтрованные
            obj.features = validFeatures;

            // Добавляем на карту
            objectManager.removeAll();
            objectManager.add(obj);
            myMap.geoObjects.add(objectManager);

            // Границы карты
            if (
                minLatitude !== Infinity && maxLatitude !== -Infinity &&
                minLongitude !== Infinity && maxLongitude !== -Infinity
            ) {
                const bounds = [
                    [minLatitude, minLongitude],
                    [maxLatitude, maxLongitude]
                ];
                myMap.setBounds(bounds, { checkZoomRange: true });
            }

            // ✅ Фильтр ОТ/ДО + флаг ГИБДД
            setupFilterUI(minQuantity, maxQuantity, objectManager);
        })
        .catch(err => {
            console.error('Ошибка загрузки anna.json:', err);
        });
}

/**
 * Получаем количество ДК:
 * 1) feature.properties.quantity
 * 2) парсим из balloonContentBody
 */
function extractQuantity(feature) {
    if (!feature.properties) return null;

    if (
        feature.properties.quantity !== undefined &&
        feature.properties.quantity !== null &&
        feature.properties.quantity !== ''
    ) {
        const qNum = Number(feature.properties.quantity);
        if (Number.isFinite(qNum)) return qNum;
    }

    const body = feature.properties.balloonContentBody;
    if (typeof body === 'string') {
        const re = /Кол-во\s+ДК\s+за\s+месяц:\s*<span[^>]*>([\d\s]+)/i;
        const match = body.match(re);
        if (match && match[1]) {
            const numStr = match[1].replace(/\s+/g, '');
            const q = parseInt(numStr, 10);
            if (!isNaN(q)) return q;
        }
    }

    return null;
}

function setupFilterUI(minQuantity, maxQuantity, objectManager) {
    const toggleBtn = document.getElementById('filter-toggle');
    const gibddToggle = document.getElementById('gibdd-toggle');
    const panel = document.getElementById('filter-panel');

    const fromRange = document.getElementById('quantity-from-range');
    const toRange = document.getElementById('quantity-to-range');
    const fromInput = document.getElementById('quantity-from-input');
    const toInput = document.getElementById('quantity-to-input');

    const currentValueLabel = document.getElementById('filter-current-value');

    if (!toggleBtn || !gibddToggle || !panel ||
        !fromRange || !toRange || !fromInput || !toInput || !currentValueLabel) {
        console.warn('Элементы фильтра не найдены в DOM.');
        return;
    }

    // панель изначально скрыта
    panel.style.display = 'none';

    // если все значения одинаковые — расширим максимум на 1, чтобы ползунки работали
    const rangeMin = minQuantity;
    const rangeMax = (minQuantity === maxQuantity) ? (maxQuantity + 1) : maxQuantity;

    [fromRange, toRange].forEach(el => {
        el.min = rangeMin;
        el.max = rangeMax;
        el.step = 1;
    });

    [fromInput, toInput].forEach(el => {
        el.min = rangeMin;
        el.max = rangeMax;
        el.step = 1;
    });

    currentFromQuantity = rangeMin;
    currentToQuantity = rangeMax;

    fromRange.value = currentFromQuantity;
    toRange.value = currentToQuantity;
    fromInput.value = currentFromQuantity;
    toInput.value = currentToQuantity;

    updateLabel(currentFromQuantity, currentToQuantity);

    // Показ/скрытие панели
    toggleBtn.addEventListener('click', () => {
        panel.style.display = (panel.style.display === 'block') ? 'none' : 'block';
    });

    // ГИБДД флаг
    showGibdd = true;
    gibddToggle.classList.add('active');

    gibddToggle.addEventListener('click', () => {
        showGibdd = !showGibdd;
        gibddToggle.classList.toggle('active', showGibdd);
        applyFilter(currentFromQuantity, currentToQuantity, objectManager);
    });

    function clamp(v) {
        if (isNaN(v)) v = rangeMin;
        if (v < rangeMin) v = rangeMin;
        if (v > rangeMax) v = rangeMax;
        return v;
    }

    function syncAndApply(fromVal, toVal) {
        fromVal = clamp(fromVal);
        toVal = clamp(toVal);

        if (fromVal > toVal) toVal = fromVal;

        currentFromQuantity = fromVal;
        currentToQuantity = toVal;

        fromRange.value = fromVal;
        fromInput.value = fromVal;
        toRange.value = toVal;
        toInput.value = toVal;

        updateLabel(fromVal, toVal);
        applyFilter(fromVal, toVal, objectManager);
    }

    fromRange.addEventListener('input', () => syncAndApply(parseInt(fromRange.value, 10), parseInt(toRange.value, 10)));
    toRange.addEventListener('input', () => syncAndApply(parseInt(fromRange.value, 10), parseInt(toRange.value, 10)));
    fromInput.addEventListener('input', () => syncAndApply(parseInt(fromInput.value, 10), parseInt(toInput.value, 10)));
    toInput.addEventListener('input', () => syncAndApply(parseInt(fromInput.value, 10), parseInt(toInput.value, 10)));

    function updateLabel(fromVal, toVal) {
        currentValueLabel.textContent = `Показываются точки с кол-вом от ${fromVal} до ${toVal}`;
    }

    applyFilter(currentFromQuantity, currentToQuantity, objectManager);
}

function applyFilter(fromQty, toQty, objectManager) {
    currentFromQuantity = fromQty;
    currentToQuantity = toQty;

    if (!objectManager) return;

    objectManager.setFilter(obj => {
        const preset = obj.options && obj.options.preset;
        const isBlue = preset === 'islands#blueIcon';

        // Синие точки (ГИБДД)
        if (isBlue) return showGibdd;

        const q = extractQuantity(obj);
        if (q === null) return false;

        return q >= currentFromQuantity && q <= currentToQuantity;
    });
}
