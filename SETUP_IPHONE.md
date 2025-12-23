# Quick Setup Guide for iPhone

## Step-by-Step Instructions

### 1. Start the Server on Your Mac

Open Terminal and run:

```bash
cd /Users/nadavyaron/finance-dashboard
python3 -m http.server 8000 --bind 0.0.0.0
```

**Keep this terminal window open** - the server needs to keep running.

### 2. Find Your Mac's IP Address

- Open **System Settings** → **Network** → **Wi-Fi**
- Click **Details** next to your Wi-Fi connection
- Note the **IP Address** (looks like `192.168.1.XXX`)

### 3. Access from iPhone

1. Make sure your iPhone is on the **same Wi-Fi network** as your Mac
2. Open **Safari** on your iPhone
3. Type in the address bar: `http://YOUR_MAC_IP:8000`
   - Example: `http://192.168.1.100:8000`
4. The app should load!

### 4. Add to Home Screen

1. Tap the **Share button** (square with arrow pointing up) at the bottom
2. Scroll down and tap **"Add to Home Screen"**
3. You can rename it if you want (default: "Finance Dashboard")
4. Tap **"Add"** in the top right
5. The app icon will appear on your home screen!

### 5. Use It!

- Tap the icon to open the app
- It will open fullscreen like a native app
- All your data is stored locally on your iPhone
- Works offline!

## Troubleshooting

**Can't connect?**
- Make sure both devices are on the same Wi-Fi
- Check your Mac's firewall settings
- Try using `localhost` or `127.0.0.1` won't work - you need your Mac's actual IP

**Want to access from anywhere?**
- Use ngrok: `ngrok http 8000`
- Or deploy to Netlify/Vercel for free hosting

**Icons look generic?**
- That's normal! Safari will use a screenshot of the app
- To add custom icons, create 192x192 and 512x512 PNG images named `icon-192.png` and `icon-512.png`

## Tips

- The app works completely offline once loaded
- Data is stored in your iPhone's browser storage
- Each device has its own separate data
- To sync data, you'd need to export/import manually (future feature)

