# Real-Time Visual Privacy Protection System Against Shoulder-Surfing Attacks

## Overview

This project presents a real-time visual privacy protection system implemented as a Chrome Extension to defend against shoulder-surfing attacks.

Shoulder-surfing is a visual eavesdropping attack where unauthorized individuals observe sensitive on-screen information in public or shared environments such as classrooms, libraries, offices, and cafés.

This system uses real-time face detection via the device webcam to monitor the surrounding environment and automatically applies privacy protection when multiple faces are detected.

---

## Problem Statement

Traditional authentication and browsing systems are vulnerable to visual observation in public environments.

Physical privacy screens are:
- Static
- Ineffective in dynamic environments
- Unable to detect when someone is behind the user

There is a need for a software-based, intelligent, real-time solution that actively protects our privacy.

---

## Proposed Solution

The system works as a Chrome Extension (Manifest V3) that:

1. Accesses the webcam (with user permission)
2. Detects faces in real-time using MediaPipe / face-api.js
3. Counts the number of faces in each frame
4. If faceCount > 1:
   - Applies blur/dim overlay to the webpage
   - Displays shoulder-surfing warning
5. Restores normal screen visibility when only one face remains

All processing is performed locally within the browser.

---

## System Architecture

The extension consists of the following modules:

- **Popup Module (popup.html / popup.js)**  
  Provides UI to start/stop detection and control privacy settings.

- **Background Service Worker (background.js)**  
  Manages extension state and coordinates communication.

- **Content Script (content.js)**  
  Applies blur/dim overlays and displays warning messages.

- **Face Detection Module (face_detection.js)**  
  Accesses webcam, runs ML model, counts faces in real time.

---

## Key Features

✔ Real-time face detection  
✔ Automatic privacy enforcement  
✔ Blur/dim webpage overlay  
✔ Instant warning alerts  
✔ Fully local ML processing  
✔ Zero cloud transmission  
✔ Webcam stops when detection stops  

---

## Tech Stack

- HTML
- CSS
- JavaScript
- Chrome Extensions (Manifest V3)
- MediaPipe / face-api.js
- WebRTC (getUserMedia API)

---

## Privacy & Security Assurance

This system is designed with strict privacy guarantees:

- No images or video frames are stored
- No data is transmitted to servers
- All ML processing occurs locally
- Webcam access is active only during detection
- No background tracking when extension is inactive

---

## Installation (Developer Mode)

1. Clone this repository
2. Open Google Chrome
3. Navigate to: `chrome://extensions/`
4. Enable **Developer Mode**
5. Click **Load Unpacked**
6. Select the project folder

The extension will now appear in your browser toolbar.

---

## Testing & Performance

The system was tested for:

- Functional correctness
- Real-time responsiveness (10–30 FPS)
- Multiple lighting conditions
- Compatibility across Chromium-based browsers
- Security and privacy compliance

The extension performed reliably under standard laptop hardware conditions.

---
