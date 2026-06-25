export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = url.searchParams.get('url');
    if (!target) return new Response('?url= required', { status: 400 });

    const targetUrl = new URL(target);
    const selfBase = url.origin + url.pathname + '?url=';

    const baseHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': targetUrl.origin + '/'
    };

    // Логин для uafix.net
    let cookie = '';
    if (targetUrl.hostname.includes('uafix.net')) {
      const loginResp = await fetch('https://uafix.net/', {
        method: 'POST',
        headers: {
          ...baseHeaders,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'login_name=myxa781&login_password=blbntyf%5Beq1&login=submit',
        redirect: 'manual'
      });
      const sc = loginResp.headers.getAll('set-cookie');
      cookie = sc.map(c => c.split(';')[0]).join('; ');
    }

    const headers = { ...baseHeaders };
    if (cookie) headers['Cookie'] = cookie;

    const resp = await fetch(target, { headers, redirect: 'follow' });
    const ct = resp.headers.get('Content-Type') || '';
    let body = await resp.text();

    // Если m3u8 — переписываем ВСЕ URL через прокси
    if (target.includes('.m3u8') || ct.includes('mpegurl')) {
      const base = target.substring(0, target.lastIndexOf('/') + 1);
      body = body.split('\n').map(line => {
        const l = line.trim();
        if (l && !l.startsWith('#')) {
          const absolute = l.startsWith('http') ? l : base + l;
          return selfBase + encodeURIComponent(absolute);
        }
        return line;
      }).join('\n');

      return new Response(body, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/vnd.apple.mpegurl'
        }
      });
    }

    // Если .ts сегмент — возвращаем бинарные данные напрямую
    if (target.includes('.ts') || target.includes('.m4s') || ct.includes('video/')) {
      const binResp = await fetch(target, { headers, redirect: 'follow' });
      const binBody = await binResp.arrayBuffer();
      return new Response(binBody, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': ct || 'video/MP2T'
        }
      });
    }

    return new Response(body, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': ct || 'text/html'
      }
    });
  }
}
