# NOXVUS — Instant Web Deploy
> by @xzrinx

Upload HTML atau ZIP langsung dapet link netlify.app. Selesai.

## Setup

### 1. Dapetin Netlify Token
- Login ke https://app.netlify.com
- Ke: User Settings Applications Personal Access Tokens
- Generate token baru, simpan

### 2. Deploy ke Vercel
```bash
vercel deploy
```

### 3. Set Environment Variable
Di Vercel dashboard Settings Environment Variables:
```
NETLIFY_TOKEN=your_netlify_personal_access_token
```

## Struktur
```
noxvus-deploy/
├── api/
│   └── deploy.js      ← Backend: upload ke Netlify API
├── public/
│   └── index.html     ← Frontend
├── package.json
└── vercel.json
```

## Flow
1. User upload HTML/ZIP + isi nama site (opsional)
2. Backend bikin site baru di Netlify via API
3. Deploy zip ke site tersebut
4. User langsung dapet URL xxx.netlify.app
