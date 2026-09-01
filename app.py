from flask import Flask, request, send_file, jsonify, send_from_directory
from flask_cors import CORS
import yt_dlp
import os
import urllib.parse

app = Flask(__name__, static_url_path='', static_folder='.')
CORS(app, expose_headers=["X-Song-Title"])

@app.route('/')
def home():
    return send_from_directory('.', 'index.html')

@app.route('/search', methods=['POST'])
def search_audio():
    data = request.get_json()
    query = data.get('query', '').strip()
    if not query:
        return jsonify({'error': 'No query provided'}), 400

    ydl_opts = {
        'quiet': True,
        'extract_flat': True,
        'skip_download': True
    }
    if os.path.exists('cookies.txt'):
        ydl_opts['cookiefile'] = 'cookies.txt'

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"ytsearch15:{query}", download=False)
            results = []
            if 'entries' in info:
                for entry in info['entries']:
                    results.append({
                        'title': entry.get('title'),
                        'url': f"https://www.youtube.com/watch?v={entry.get('id')}"
                    })
            return jsonify({'results': results})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/download', methods=['POST'])
def download_audio():
    data = request.get_json()
    if not data or 'url' not in data:
        return jsonify({'error': 'No URL provided'}), 400
    
    url = data.get('url')

    # Ab hum sirf best audio ka direct URL nikalenge, file download nahi karenge
    ydl_opts = {
        'format': 'bestaudio/best',
        'quiet': True
    }
    if os.path.exists('cookies.txt'):
        ydl_opts['cookiefile'] = 'cookies.txt'

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            direct_url = info.get('url') 
            title = info.get('title', 'Mann Sutra Song')
        
        # Server direct URL frontend ko bhej dega
        return jsonify({'direct_url': direct_url, 'title': title})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/upload', methods=['POST'])
def wireless_upload():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    filepath = os.path.join('.', file.filename)
    file.save(filepath)
    return jsonify({'success': True, 'filename': file.filename})

if __name__ == '__main__':
    # Dhyan dein: Agar server kisi cloud par (Render/Vercel) deploy kar rahe hain to host/port settings cloud ke hisaab se use hongi
    app.run(host='0.0.0.0', port=5000)
