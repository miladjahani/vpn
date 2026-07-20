export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const ADMIN_PATH = '/admin';

    // تنظیمات پیش‌فرض اگر در KV یا حافظه نباشد
    let config = {
      enabled: true,
      proxyUrl: "https://example.com"
    };

    // اگر KV تنظیم شده باشد (PROXY_CONFIG) سعی در خواندن تنظیمات
    try {
      if (env.PROXY_CONFIG) {
         const storedConfig = await env.PROXY_CONFIG.get("config", { type: "json" });
         if (storedConfig) {
             config = { ...config, ...storedConfig };
         }
      }
    } catch (e) {
      // در صورت نبود KV از تنظیمات پیش‌فرض استفاده می‌شود
    }


    // --- Admin Panel Routes ---
    if (url.pathname.startsWith(ADMIN_PATH)) {
        // Basic Authentication Check
        const authHeader = request.headers.get('Authorization');
        const adminUsername = env.ADMIN_USERNAME || 'admin';
        const adminPassword = env.ADMIN_PASSWORD || 'admin123';

        const expectedAuth = 'Basic ' + btoa(`${adminUsername}:${adminPassword}`);

        if (!authHeader || authHeader !== expectedAuth) {
            return new Response('Unauthorized', {
                status: 401,
                headers: {
                    'WWW-Authenticate': 'Basic realm="Admin Panel", charset="UTF-8"'
                }
            });
        }

        if (url.pathname === ADMIN_PATH || url.pathname === ADMIN_PATH + '/') {
            return handleAdminUI(config);
        }

        if (url.pathname === '/admin/api/save' && request.method === 'POST') {
            return handleSaveConfig(request, env);
        }

        if (url.pathname === '/admin/api/config' && request.method === 'GET') {
            return new Response(JSON.stringify(config), { headers: { 'Content-Type': 'application/json' }});
        }
    }

    // --- Proxy Logic ---
    if (!config.enabled) {
      return new Response("سرویس در حال حاضر غیرفعال است (Service Disabled).", { status: 403 });
    }

    // Basic Rate Limiting
    const clientIP = request.headers.get("cf-connecting-ip") || "unknown";
    if (!globalThis.rateLimits) {
        globalThis.rateLimits = new Map();
    } else if (globalThis.rateLimits.size > 1000) {
        // Prevent memory leak in Worker isolate
        globalThis.rateLimits.clear();
    }
    const now = Date.now();
    const limit = globalThis.rateLimits.get(clientIP) || { count: 0, time: now };

    if (now - limit.time > 60000) {
       limit.count = 1;
       limit.time = now;
    } else {
       limit.count++;
       if (limit.count > 100) { // Limit to 100 requests per minute
           return new Response("Too Many Requests. تعداد درخواست‌ها بیش از حد مجاز است.", { status: 429 });
       }
    }
    globalThis.rateLimits.set(clientIP, limit);

    try {
      const targetUrl = new URL(url.pathname + url.search, config.proxyUrl);

      // Copy headers to avoid fingerprinting issues where possible
      const headers = new Headers(request.headers);
      headers.set('X-Forwarded-For', clientIP);
      // Remove original Host header so the target server accepts the request
      headers.delete('Host');

      const requestInit = {
          method: request.method,
          headers: headers,
          redirect: 'manual'
      };

      if (request.method !== 'GET' && request.method !== 'HEAD') {
          requestInit.body = request.body;
      }

      const newRequest = new Request(targetUrl, requestInit);

      const response = await fetch(newRequest);
      return response;
    } catch (err) {
      return new Response("خطا در پردازش درخواست پروکسی: " + err.message, { status: 500 });
    }
  }
};

async function handleSaveConfig(request, env) {
    try {
       const body = await request.json();
       const newConfig = {
           enabled: !!body.enabled,
           proxyUrl: body.proxyUrl || "https://example.com"
       };

       if (env.PROXY_CONFIG) {
           await env.PROXY_CONFIG.put("config", JSON.stringify(newConfig));
           return new Response(JSON.stringify({ success: true, message: "تنظیمات با موفقیت ذخیره شد." }), {
               headers: { 'Content-Type': 'application/json' }
           });
       } else {
           return new Response(JSON.stringify({ success: false, message: "محیط KV (PROXY_CONFIG) تنظیم نشده است. تنظیمات موقتاً اعمال شدند اما پس از ری‌استارت از بین می‌روند." }), {
               status: 500,
               headers: { 'Content-Type': 'application/json' }
           });
       }
    } catch (e) {
       return new Response(JSON.stringify({ success: false, message: e.message }), {
           status: 500,
           headers: { 'Content-Type': 'application/json' }
       });
    }
}


function handleAdminUI(config) {
  const html = `
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>سوپرپروکسی V2 | پنل مدیریت</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body { font-family: Tahoma, 'Segoe UI', sans-serif; }
        /* Custom Switch */
        .switch-input:checked ~ .switch-bg { background-color: #10b981; }
        .switch-input:checked ~ .switch-dot { transform: translateX(-1.5rem); }
        .switch-dot { transition: transform 0.3s ease-in-out; }
    </style>
</head>
<body class="bg-gray-900 text-gray-100 flex items-center justify-center min-h-screen p-4">

<div class="bg-gray-800 w-full max-w-md rounded-2xl shadow-2xl p-8 border border-gray-700">
    <h1 class="text-3xl font-bold text-center text-indigo-400 mb-2">سوپرپروکسی <span class="text-sm text-gray-400 align-top">V2</span></h1>
    <p class="text-center text-gray-400 text-sm mb-8">تنظیمات پیشرفته پروکسی کلودفلر شما</p>

    <div class="mb-6">
        <label for="proxyUrl" class="block text-sm font-semibold text-gray-300 mb-2">آدرس مقصد (Target URL)</label>
        <input type="text" id="proxyUrl" placeholder="https://example.com" value=""
            class="w-full px-4 py-3 bg-gray-900 border border-gray-600 rounded-lg text-gray-100 text-left ltr focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all">
    </div>

    <div class="mb-8">
        <div class="flex items-center justify-between p-4 bg-gray-900 rounded-lg border border-gray-600">
            <div>
                <label class="font-semibold text-gray-300 mb-1 block">وضعیت پروکسی</label>
                <span class="text-xs text-gray-500">فعال یا غیرفعال کردن کل سرویس</span>
            </div>

            <label class="flex items-center cursor-pointer relative">
                <input type="checkbox" id="enabledSwitch" class="sr-only switch-input">
                <div class="switch-bg w-11 h-6 bg-gray-600 rounded-full transition-colors"></div>
                <div class="switch-dot absolute right-1 top-1 w-4 h-4 bg-white rounded-full shadow transition-transform"></div>
            </label>
        </div>
    </div>

    <button id="saveBtn" onclick="saveSettings()"
        class="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold shadow-lg shadow-indigo-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
        ذخیره تنظیمات
    </button>

    <div id="message" class="mt-4 p-3 rounded-lg text-center text-sm font-medium hidden"></div>
</div>

<script>
    // واکشی تنظیمات اولیه هنگام لود صفحه
    window.onload = async () => {
        try {
            const res = await fetch('/admin/api/config');
            if(res.ok) {
                const data = await res.json();
                document.getElementById('proxyUrl').value = data.proxyUrl;
                document.getElementById('enabledSwitch').checked = data.enabled;
            }
        } catch(e) {
            console.error("خطا در دریافت اطلاعات", e);
        }
    }

    async function saveSettings() {
        const proxyUrl = document.getElementById('proxyUrl').value;
        const enabled = document.getElementById('enabledSwitch').checked;
        const btn = document.getElementById('saveBtn');
        const msgBox = document.getElementById('message');

        if (!proxyUrl || !proxyUrl.startsWith('http')) {
            showMessage("آدرس مقصد باید معتبر و با http/https شروع شود.", false);
            return;
        }

        btn.disabled = true;
        btn.innerText = "در حال ذخیره...";
        msgBox.style.display = 'none';

        try {
            const response = await fetch('/admin/api/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ proxyUrl, enabled })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                showMessage(result.message || "تنظیمات ذخیره شد.", true);
            } else {
                showMessage(result.message || "خطا در ذخیره تنظیمات.", false);
            }
        } catch (error) {
            showMessage("خطای ارتباط با سرور.", false);
        } finally {
            btn.disabled = false;
            btn.innerText = "ذخیره تنظیمات";
        }
    }

    function showMessage(text, isSuccess) {
        const msgBox = document.getElementById('message');
        msgBox.innerText = text;
        msgBox.className = isSuccess ? 'mt-4 p-3 rounded-lg text-center text-sm font-medium bg-emerald-900/50 text-emerald-400 border border-emerald-500/50 block' : 'mt-4 p-3 rounded-lg text-center text-sm font-medium bg-red-900/50 text-red-400 border border-red-500/50 block';
    }
</script>

</body>
</html>
  `;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=UTF-8' }
  });
}
