// Импортируем 'node-fetch'
const fetch = require('node-fetch');

// Ваш API ключ от EODHD
const API_KEY = '68a301572f2fc6.55349656';

// Вспомогательные функции
function getPastDate(period) {
    const date = new Date();
    switch (period) {
        case 'week': date.setDate(date.getDate() - 7); break;
        case 'month': date.setMonth(date.getMonth() - 1); break;
        case '1Y': date.setFullYear(date.getFullYear() - 1); break;
        case '5Y': date.setFullYear(date.getFullYear() - 5); break;
        default: return null;
    }
    return date.toISOString().split('T')[0];
}

function formatTicker(ticker) {
    if (!ticker.includes('.')) { return `${ticker}.US`; }
    return ticker;
}

exports.handler = async function(event, context) {
    const { ticker, period } = event.queryStringParameters;
    const formattedTicker = formatTicker(ticker);

    try {
        // 1. Получаем фундаментальные данные
        const fundamentalsResponse = await fetch(`https://eodhistoricaldata.com/api/fundamentals/${formattedTicker}?api_token=${API_KEY}&fmt=json`);
        if (!fundamentalsResponse.ok) throw new Error(`Fundamentals not found for ${ticker}`);
        const data = await fundamentalsResponse.json();

        // 2. Получаем последние данные о цене и изменении
        const historyResponse = await fetch(`https://eodhistoricaldata.com/api/eod/${formattedTicker}?api_token=${API_KEY}&period=d&limit=1&fmt=json`);
        const historyData = await historyResponse.json();
        const latestQuote = historyData && historyData.length > 0 ? historyData[0] : null;

        let changeHtml = 'N/A';
        if (period === 'today' && latestQuote) {
            const change = latestQuote.change || 0;
            const changePercent = latestQuote.change_p || 0;
            const className = change >= 0 ? 'price-plus' : 'price-minus';
            changeHtml = `<span class="${className}">${change.toFixed(2)} (${(changePercent * 100).toFixed(2)}%)</span>`;
        } else if (latestQuote) {
            const pastDate = getPastDate(period);
            const pastHistoryResponse = await fetch(`https://eodhistoricaldata.com/api/eod/${formattedTicker}?from=${pastDate}&to=${pastDate}&api_token=${API_KEY}&fmt=json`);
            const pastHistoryData = await pastHistoryResponse.json();
            const pastPrice = pastHistoryData && pastHistoryData.length > 0 ? pastHistoryData[0].close : null;
            if (pastPrice) {
                const currentPrice = latestQuote.close;
                const change = currentPrice - pastPrice;
                const changePercent = (change / pastPrice) * 100;
                const className = change >= 0 ? 'price-plus' : 'price-minus';
                changeHtml = `<span class="${className}">${change.toFixed(2)} (${changePercent.toFixed(2)}%)</span>`;
            }
        }

        // 3. Форматируем все данные для отправки обратно в браузер
        const responsePayload = {
            price: latestQuote ? latestQuote.close.toFixed(2) : 'N/A',
            changeHtml: changeHtml,
            marketCap: data.Highlights?.MarketCapitalization ? (data.Highlights.MarketCapitalization / 1e9).toFixed(2) + 'B' : 'N/A',
            peRatio: data.Valuations?.TrailingPE ? data.Valuations.TrailingPE.toFixed(2) : 'N/A',
            pbRatio: data.Valuations?.PriceBookMRQ ? data.Valuations.PriceBookMRQ.toFixed(2) : 'N/A',
            psRatio: data.Valuations?.PriceSalesTTM ? data.Valuations.PriceSalesTTM.toFixed(2) : 'N/A',
            eps: data.Highlights?.EarningsShare ? data.Highlights.EarningsShare.toFixed(2) : 'N/A',
            roe: data.Highlights?.ReturnOnEquityTTM ? (data.Highlights.ReturnOnEquityTTM * 100).toFixed(2) + '%' : 'N/A',
            roa: data.Highlights?.ReturnOnAssetsTTM ? (data.Highlights.ReturnOnAssetsTTM * 100).toFixed(2) + '%' : 'N/A',
        };

        return {
            statusCode: 200,
            body: JSON.stringify(responsePayload),
        };

    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};
