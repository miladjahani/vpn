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
      return new Response("Service is currently disabled.", { status: 403 });
    }

    try {
      const targetUrl = new URL(url.pathname + url.search, config.proxyUrl);
      const newRequest = new Request(targetUrl, request);
      return fetch(newRequest);
    } catch (err) {
      return new Response("Error in processing proxy request: " + err.message, { status: 500 });
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
    <title>پنل مدیریت پروکسی کلودفلر</title>
    <style>
        :root {
            --primary: #4f46e5;
            --primary-hover: #4338ca;
            --bg: #f3f4f6;
            --card-bg: #ffffff;
            --text-main: #1f2937;
            --text-muted: #6b7280;
            --border: #e5e7eb;
            --success: #10b981;
            --error: #ef4444;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: Tahoma, 'Segoe UI', sans-serif;
        }

        body {
            background-color: var(--bg);
            color: var(--text-main);
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 1rem;
        }

        .container {
            background-color: var(--card-bg);
            width: 100%;
            max-width: 500px;
            border-radius: 12px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            padding: 2rem;
        }

        h1 {
            font-size: 1.5rem;
            text-align: center;
            margin-bottom: 0.5rem;
            color: var(--primary);
        }

        p.subtitle {
            text-align: center;
            color: var(--text-muted);
            font-size: 0.875rem;
            margin-bottom: 2rem;
        }

        .form-group {
            margin-bottom: 1.5rem;
        }

        label {
            display: block;
            font-size: 0.875rem;
            font-weight: 600;
            margin-bottom: 0.5rem;
        }

        input[type="text"] {
            width: 100%;
            padding: 0.75rem;
            border: 1px solid var(--border);
            border-radius: 6px;
            font-size: 1rem;
            outline: none;
            transition: border-color 0.2s;
            direction: ltr;
            text-align: left;
        }

        input[type="text"]:focus {
            border-color: var(--primary);
        }

        .toggle-container {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 1rem;
            background-color: #f9fafb;
            border: 1px solid var(--border);
            border-radius: 6px;
        }

        /* Toggle Switch CSS */
        .switch {
            position: relative;
            display: inline-block;
            width: 50px;
            height: 24px;
        }

        .switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }

        .slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #ccc;
            transition: .4s;
            border-radius: 24px;
        }

        .slider:before {
            position: absolute;
            content: "";
            height: 18px;
            width: 18px;
            left: 3px;
            bottom: 3px;
            background-color: white;
            transition: .4s;
            border-radius: 50%;
        }

        input:checked + .slider {
            background-color: var(--success);
        }

        input:checked + .slider:before {
            transform: translateX(26px);
        }

        button.save-btn {
            width: 100%;
            padding: 0.75rem;
            background-color: var(--primary);
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: background-color 0.2s;
            margin-top: 1rem;
        }

        button.save-btn:hover {
            background-color: var(--primary-hover);
        }

        button.save-btn:disabled {
            background-color: #9ca3af;
            cursor: not-allowed;
        }

        #message {
            margin-top: 1rem;
            padding: 0.75rem;
            border-radius: 6px;
            text-align: center;
            font-size: 0.875rem;
            display: none;
        }

        .success-msg {
            background-color: #d1fae5;
            color: #065f46;
            border: 1px solid #34d399;
        }

        .error-msg {
            background-color: #fee2e2;
            color: #991b1b;
            border: 1px solid #f87171;
        }
    </style>
</head>
<body>

<div class="container">
    <h1>مدیریت پروکسی</h1>
    <p class="subtitle">تنظیمات سرویس پروکسی کلودفلر</p>

    <div class="form-group">
        <label for="proxyUrl">آدرس مقصد (Target URL)</label>
        <input type="text" id="proxyUrl" placeholder="https://example.com" value="">
    </div>

    <div class="form-group">
        <div class="toggle-container">
            <div>
                <label style="margin: 0;">وضعیت پروکسی</label>
                <span style="font-size: 0.75rem; color: var(--text-muted);">فعال یا غیرفعال کردن کل سرویس</span>
            </div>
            <label class="switch">
                <input type="checkbox" id="enabledSwitch">
                <span class="slider"></span>
            </label>
        </div>
    </div>

    <button id="saveBtn" class="save-btn" onclick="saveSettings()">ذخیره تنظیمات</button>
    <div id="message"></div>
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
        msgBox.className = isSuccess ? 'success-msg' : 'error-msg';
        msgBox.style.display = 'block';
    }
</script>

</body>
</html>
  `;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=UTF-8' }
  });
}
