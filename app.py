from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import requests
import yt_dlp
import os

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

    try:
        headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        }
        payload = {
            'url': url,
            'isAudioOnly': True,
            'filenamePattern': 'classic'
        }
        
        response = requests.post('https://api.cobalt.tools/api/json', json=payload, headers=headers)
        res_data = response.json()
        
        direct_url = None
        if 'url' in res_data:
            direct_url = res_data['url']
        elif 'picker' in res_data and len(res_data['picker']) > 0:
            direct_url = res_data['picker'][0]['url']
            
        if direct_url:
            return jsonify({'direct_url': direct_url, 'title': 'Mann Sutra Song'})
        else:
            return jsonify({'error': 'Could not fetch stream from Cobalt'}), 500
            
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
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
