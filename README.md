# Finance Dashboard - iPhone Setup Guide

## How to Use on Your iPhone

### Option 1: Local Network (Recommended for Development)

1. **On your Mac:**
   - Open Terminal
   - Navigate to the finance-dashboard folder:
     ```bash
     cd /Users/nadavyaron/finance-dashboard
     ```
   - Start a local server accessible on your network:
     ```bash
     python3 -m http.server 8000 --bind 0.0.0.0
     ```
     (Or if you have Node.js: `npx serve . -l 8000`)

2. **Find your Mac's IP address:**
   - System Settings → Network → Wi-Fi → Details
   - Note the IP address (e.g., `192.168.1.100`)

3. **On your iPhone:**
   - Make sure your iPhone is on the **same Wi-Fi network** as your Mac
   - Open Safari
   - Go to: `http://YOUR_MAC_IP:8000`
     (e.g., `http://192.168.1.100:8000`)

4. **Add to Home Screen:**
   - Tap the Share button (square with arrow)
   - Scroll down and tap "Add to Home Screen"
   - Tap "Add"
   - The app will appear on your home screen like a native app!

### Option 2: Using ngrok (Access from Anywhere)

1. **Install ngrok** (if you don't have it):
   ```bash
   brew install ngrok
   ```

2. **Start your local server:**
   ```bash
   cd /Users/nadavyaron/finance-dashboard
   python3 -m http.server 8000
   ```

3. **In another terminal, start ngrok:**
   ```bash
   ngrok http 8000
   ```

4. **Copy the HTTPS URL** from ngrok (e.g., `https://abc123.ngrok.io`)

5. **On your iPhone:**
   - Open Safari
   - Go to the ngrok URL
   - Add to Home Screen (same steps as above)

### Option 3: Deploy to a Free Hosting Service

You can deploy this to:
- **Netlify Drop**: Drag and drop the folder to netlify.com/drop
- **Vercel**: `vercel deploy`
- **GitHub Pages**: Push to GitHub and enable Pages

Then access it from anywhere and add to home screen!

## Features

- ✅ Works offline (all data stored locally)
- ✅ Add to Home Screen (PWA)
- ✅ iOS-native feel
- ✅ Budget tracking
- ✅ Category management
- ✅ Currency selection
- ✅ Notifications

## Notes

- All data is stored locally in your browser (localStorage)
- Data is **not synced** between devices
- Works best when added to home screen
- Make sure to use HTTPS for production (required for PWA features)

